import { Router } from 'express';
import { z } from 'zod';
import { Errors, HttpError } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAuth } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';
import {
  getClient, listInstances, getPrimary,
  cachedFederationDiscovery, cachedFederationSlots, invalidateFederationCache,
} from '../mcsm/fleet.js';
import { McsmError } from '../mcsm/client.js';
import { hasGrant, listAccessibleServers } from '../grants/check.js';
import type { GrantCapability } from '../grants/check.js';

export const slotsRouter = Router();
slotsRouter.use(requireAuth);

// Shapes from the mcsm v1 spec (only the fields we read).
interface FedSource { instance: string; self?: boolean; ok: boolean; rtt_ms?: number; error?: string }
interface FedSlot {
  instance: string;
  name: string;
  port?: number;
  state: string;
  state_since?: string;
  mounted_server_id?: string | null;
  last_error?: { code: string; message: string; at: string } | null;
}
interface FedDiscoveryServer {
  id: string;
  name: string;
  type: string;
  version: string;
  ownership?: { state: string; instance?: string; slot?: string };
}

// ─── GET / ──────────────────────────────────────────────────────────────
// Federated slot list. We hit `/federation/slots` and `/federation/discovery`
// in parallel on the primary peer; the catalog from /discovery enriches each
// slot's `mounted_server_id` with name/type/version so the dashboard can
// render server cards without N+1 detail calls.
slotsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessible = req.currentUser!.isAdmin
      ? null
      : new Set(
          (await listAccessibleServers(req.currentUser!.id)).map(
            (g) => `${g.mcsmInstanceId}:${g.serverId}`,
          ),
        );

    const primary = await getPrimary();
    const instances = await listInstances();
    const idByName = new Map(instances.map((i) => [i.name, i.id]));

    let slots: FedSlot[] = [];
    let sources: FedSource[] = [];
    const serverCatalog = new Map<string, FedDiscoveryServer>();

    let usedFederation = false;
    if (primary) {
      try {
        const [fedSlots, fedDisc] = await Promise.all([
          cachedFederationSlots() as Promise<{ sources: FedSource[]; slots: FedSlot[] } | null>,
          cachedFederationDiscovery().catch(() => null) as Promise<{ servers: FedDiscoveryServer[] } | null>,
        ]);
        if (fedSlots) {
          slots = fedSlots.slots ?? [];
          sources = fedSlots.sources ?? [];
          for (const s of fedDisc?.servers ?? []) serverCatalog.set(s.id, s);
          usedFederation = true;
        }
      } catch (err) {
        if (!(err instanceof McsmError) || err.status !== 404) throw err;
      }
    }

    if (!usedFederation) {
      // Per-peer fan-out. Each peer's `/slots` is decorated with `instance`
      // (self-name from mcsm); we use the configured fleet name as a proxy.
      await Promise.all(
        instances.map(async (inst) => {
          try {
            const [slotsResp, discResp] = await Promise.all([
              inst.client.slots() as Promise<{ slots: FedSlot[] }>,
              inst.client.discovery().catch(() => null) as Promise<{ servers: FedDiscoveryServer[] } | null>,
            ]);
            for (const s of slotsResp.slots ?? []) slots.push({ ...s, instance: inst.name });
            for (const srv of discResp?.servers ?? []) serverCatalog.set(srv.id, srv);
            sources.push({ instance: inst.name, ok: true });
          } catch (err) {
            sources.push({ instance: inst.name, ok: false, error: (err as Error).message });
          }
        }),
      );
    }

    const out = [];
    for (const s of slots) {
      const instanceId = idByName.get(s.instance) ?? '';
      const mountedId = s.mounted_server_id ?? null;
      if (accessible && (!mountedId || !accessible.has(`${instanceId}:${mountedId}`))) continue;
      const mounted = mountedId ? serverCatalog.get(mountedId) ?? null : null;
      out.push({
        instanceId,
        instanceName: s.instance,
        slot: { ...s, mounted_server: mounted },
        canControl:
          req.currentUser!.isAdmin ||
          (mountedId
            ? await hasGrant(req.currentUser!.id, instanceId, mountedId, 'start')
            : false),
      });
    }

    res.json({ slots: out, sources });
  }),
);

type SlotParams = { instanceId: string; slot: string };

// ─── GET /:instanceId/:slot ─────────────────────────────────────────────
slotsRouter.get(
  '/:instanceId/:slot',
  asyncHandler<SlotParams>(async (req, res) => {
    const { instanceId, slot } = req.params;
    const client = await getClient(instanceId);
    if (!client) throw Errors.notFound('mcsm instance not found');
    const data = await client.slot(slot) as { mounted_server?: { id?: string } | null };
    const mountedId = data?.mounted_server?.id ?? null;
    if (!req.currentUser!.isAdmin) {
      if (!mountedId) throw Errors.forbidden();
      const ok = await hasGrant(req.currentUser!.id, instanceId, mountedId, 'observe');
      if (!ok) throw Errors.forbidden();
    }
    res.json({ instanceId, slot: data });
  }),
);

// ─── Slot lifecycle ─────────────────────────────────────────────────────
const StartBody = z.object({ serverId: z.string().min(1), force: z.boolean().optional() });

slotsRouter.post(
  '/:instanceId/:slot/start',
  asyncHandler<SlotParams>(async (req, res) => {
    const { instanceId, slot } = req.params;
    const body = StartBody.parse(req.body);
    await assertGrant(req, instanceId, body.serverId, 'start');
    const client = await getClient(instanceId);
    if (!client) throw Errors.notFound('mcsm instance not found');
    try {
      const result = await client.startSlot(slot, { server_id: body.serverId, force: body.force });
      invalidateFederationCache();
      await auditFromReq(req, {
        action: 'slot.start',
        target: { instanceId, slot, serverId: body.serverId },
      });
      res.json(result);
    } catch (err) {
      throw mapMcsmError(err);
    }
  }),
);

const StopBody = z.object({
  graceful_seconds: z.number().int().min(0).max(3600).optional(),
  broadcast_every: z.number().int().min(1).max(600).optional(),
  broadcast_template: z.string().max(280).optional(),
});

slotsRouter.post(
  '/:instanceId/:slot/stop',
  asyncHandler<SlotParams>(async (req, res) => {
    const { instanceId, slot } = req.params;
    const body = StopBody.parse(req.body ?? {});
    const mountedId = await getMountedServerId(instanceId, slot);
    await assertGrant(req, instanceId, mountedId, 'stop');
    const client = await getClient(instanceId);
    if (!client) throw Errors.notFound();
    try {
      const result = await client.stopSlot(slot, body);
      invalidateFederationCache();
      await auditFromReq(req, { action: 'slot.stop', target: { instanceId, slot } });
      res.json(result);
    } catch (err) {
      throw mapMcsmError(err);
    }
  }),
);

slotsRouter.post(
  '/:instanceId/:slot/restart',
  asyncHandler<SlotParams>(async (req, res) => {
    const { instanceId, slot } = req.params;
    const body = StopBody.parse(req.body ?? {});
    const mountedId = await getMountedServerId(instanceId, slot);
    await assertGrant(req, instanceId, mountedId, 'restart');
    const client = await getClient(instanceId);
    if (!client) throw Errors.notFound();
    try {
      const result = await client.restartSlot(slot, body);
      invalidateFederationCache();
      await auditFromReq(req, { action: 'slot.restart', target: { instanceId, slot } });
      res.json(result);
    } catch (err) {
      throw mapMcsmError(err);
    }
  }),
);

// Mounted-server actions (say, players, kick/ban, properties, ...) are
// served by `serverActionsRouter` mounted at `/api/slots/:instanceId/:slot/server`.

// ─── Helpers ────────────────────────────────────────────────────────────
async function getMountedServerId(instanceId: string, slot: string): Promise<string> {
  const client = await getClient(instanceId);
  if (!client) throw Errors.notFound('mcsm instance not found');
  const data = await client.slot(slot) as { mounted_server?: { id?: string } | null; mounted_server_id?: string };
  const id = data?.mounted_server?.id ?? data?.mounted_server_id;
  if (!id) throw Errors.conflict('no_server_mounted', 'Slot has no server mounted');
  return id;
}

async function assertGrant(
  req: import('express').Request,
  instanceId: string,
  serverId: string,
  cap: GrantCapability,
): Promise<void> {
  if (req.currentUser!.isAdmin) return;
  const ok = await hasGrant(req.currentUser!.id, instanceId, serverId, cap);
  if (!ok) throw Errors.forbidden(`Missing ${cap} permission for this server`);
}

// Preserve the upstream HTTP status from mcsm so callers see, e.g.,
// 404 server_not_found rather than a generic 409. Forward mcsm's
// trace_id and (on 429) the Retry-After header.
function mapMcsmError(err: unknown): unknown {
  if (err instanceof McsmError) {
    return new HttpError(err.status, err.code, err.message, err.details, {
      traceId: err.traceId,
      headers: err.retryAfter !== undefined ? { 'Retry-After': String(err.retryAfter) } : undefined,
    });
  }
  return err;
}
