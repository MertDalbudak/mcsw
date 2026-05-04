// All operations on the server *currently mounted in a slot*. Mounted at
// `/api/slots/:instanceId/:slot/server` — every route here resolves the
// instance + mounted server id, then checks the user's grant for that
// (instance, server_id) pair before forwarding to mcsm.

import { Router, type Request } from 'express';
import { z } from 'zod';
import { Errors, HttpError } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAuth } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';
import { getClient } from '../mcsm/fleet.js';
import { McsmClient, McsmError } from '../mcsm/client.js';
import { hasGrant } from '../grants/check.js';
import type { GrantCapability } from '../grants/check.js';

export const serverActionsRouter = Router({ mergeParams: true });
serverActionsRouter.use(requireAuth);

type SlotCtx = { instanceId: string; slot: string };

interface SlotInfo { mounted_server?: { id?: string } | null; mounted_server_id?: string | null; state?: string }

async function resolveCtx(req: Request<SlotCtx>): Promise<{
  client: McsmClient;
  serverId: string;
  instanceId: string;
  slot: string;
}> {
  const { instanceId, slot } = req.params;
  const client = await getClient(instanceId);
  if (!client) throw Errors.notFound('mcsm instance not found');
  const data = (await client.slot(slot)) as SlotInfo;
  const serverId = data.mounted_server?.id ?? data.mounted_server_id ?? null;
  if (!serverId) throw Errors.conflict('no_server_mounted', 'Slot has no server mounted');
  return { client, serverId, instanceId, slot };
}

async function assertGrant(
  req: Request,
  instanceId: string,
  serverId: string,
  cap: GrantCapability,
): Promise<void> {
  if (req.currentUser!.isAdmin) return;
  const ok = await hasGrant(req.currentUser!.id, instanceId, serverId, cap);
  if (!ok) throw Errors.forbidden(`Missing ${cap} permission for this server`);
}

function mapMcsmError(err: unknown): unknown {
  if (err instanceof McsmError) {
    return new HttpError(err.status, err.code, err.message, err.details, {
      traceId: err.traceId,
      headers: err.retryAfter !== undefined ? { 'Retry-After': String(err.retryAfter) } : undefined,
    });
  }
  return err;
}

// Wrap an mcsm call with grant + error mapping. Reduces boilerplate in
// every handler below.
function action<R>(
  cap: GrantCapability,
  fn: (ctx: { client: McsmClient; slot: string; serverId: string; instanceId: string }, req: Request<SlotCtx>) => Promise<R>,
) {
  return asyncHandler<SlotCtx>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, cap);
    try {
      const result = await fn(ctx, req);
      res.json(result);
    } catch (err) {
      throw mapMcsmError(err);
    }
  });
}

// ─── Command & say ──────────────────────────────────────────────────────
const CommandBody = z.object({ command: z.string().min(1).max(1024) });
serverActionsRouter.post(
  '/command',
  asyncHandler<SlotCtx>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'command');
    const body = CommandBody.parse(req.body);
    try {
      const result = await ctx.client.command(ctx.slot, body.command);
      await auditFromReq(req, {
        action: 'server.command',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, command: body.command },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

const SayBody = z.object({ message: z.string().min(1).max(280) });
serverActionsRouter.post(
  '/say',
  asyncHandler<SlotCtx>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'command');
    const body = SayBody.parse(req.body);
    try {
      const result = await ctx.client.say(ctx.slot, body.message);
      await auditFromReq(req, {
        action: 'server.say',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, msg: body.message },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

// ─── Players & moderation ───────────────────────────────────────────────
serverActionsRouter.get('/players', action('observe', ({ client, slot }) => client.players(slot) as Promise<unknown>));

const KickBody = z.object({ reason: z.string().max(280).optional() });
serverActionsRouter.post(
  '/players/:player/kick',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'moderate');
    const body = KickBody.parse(req.body ?? {});
    try {
      const result = await ctx.client.kick(ctx.slot, req.params.player, body.reason);
      await auditFromReq(req, {
        action: 'server.kick',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

const BanBody = z.object({
  reason: z.string().max(280).optional(),
  duration: z.string().max(32).optional(),
  ban_ip: z.boolean().optional(),
});
serverActionsRouter.post(
  '/players/:player/ban',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'moderate');
    const body = BanBody.parse(req.body ?? {});
    try {
      const result = await ctx.client.ban(ctx.slot, req.params.player, body);
      await auditFromReq(req, {
        action: 'server.ban',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player, ...body },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.post(
  '/players/:player/unban',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'moderate');
    try {
      const result = await ctx.client.unban(ctx.slot, req.params.player);
      await auditFromReq(req, {
        action: 'server.unban',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

const OpBody = z.object({ level: z.number().int().min(0).max(4).optional() });
serverActionsRouter.post(
  '/players/:player/op',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    const body = OpBody.parse(req.body ?? {});
    try {
      const result = await ctx.client.op(ctx.slot, req.params.player, body.level);
      await auditFromReq(req, {
        action: 'server.op',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player, level: body.level },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.post(
  '/players/:player/deop',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    try {
      const result = await ctx.client.deop(ctx.slot, req.params.player);
      await auditFromReq(req, {
        action: 'server.deop',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

// ─── Whitelist ──────────────────────────────────────────────────────────
serverActionsRouter.get('/whitelist', action('observe', ({ client, slot }) => client.whitelist(slot) as Promise<unknown>));

serverActionsRouter.put(
  '/whitelist/:player',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    try {
      const result = await ctx.client.addWhitelist(ctx.slot, req.params.player);
      await auditFromReq(req, {
        action: 'server.whitelist.add',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.delete(
  '/whitelist/:player',
  asyncHandler<SlotCtx & { player: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    try {
      const result = await ctx.client.removeWhitelist(ctx.slot, req.params.player);
      await auditFromReq(req, {
        action: 'server.whitelist.remove',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, player: req.params.player },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.post(
  '/whitelist/reload',
  action('admin', async ({ client, slot }, req) => {
    const result = await client.reloadWhitelist(slot);
    await auditFromReq(req, { action: 'server.whitelist.reload' });
    return result;
  }),
);

// ─── Banlist ────────────────────────────────────────────────────────────
serverActionsRouter.get('/banlist',     action('observe', ({ client, slot }) => client.banlist(slot)   as Promise<unknown>));
serverActionsRouter.get('/banlist/ips', action('observe', ({ client, slot }) => client.ipBanlist(slot) as Promise<unknown>));

// ─── Properties ─────────────────────────────────────────────────────────
serverActionsRouter.get('/properties', action('observe', ({ client, slot }) => client.properties(slot) as Promise<unknown>));

const PatchProps = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
serverActionsRouter.patch(
  '/properties',
  asyncHandler<SlotCtx>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    const body = PatchProps.parse(req.body);
    try {
      const result = await ctx.client.patchProperties(ctx.slot, body.values);
      await auditFromReq(req, {
        action: 'server.properties.patch',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, keys: Object.keys(body.values) },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

// ─── Logs (HTTP tail) ───────────────────────────────────────────────────
serverActionsRouter.get(
  '/logs',
  action('observe', ({ client, slot }, req) => {
    const tail = parseIntOpt(req.query.tail);
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const level = Array.isArray(req.query.level)
      ? (req.query.level as string[])
      : typeof req.query.level === 'string' ? [req.query.level] : undefined;
    return client.logs(slot, { tail, since, level }) as Promise<unknown>;
  }),
);

// ─── Backups ────────────────────────────────────────────────────────────
serverActionsRouter.get('/backups', action('admin', ({ client, slot }) => client.backups(slot) as Promise<unknown>));

const CreateBackup = z.object({
  label: z.string().max(80).optional(),
  stop_server: z.boolean().optional(),
  include_logs: z.boolean().optional(),
});
serverActionsRouter.post(
  '/backups',
  asyncHandler<SlotCtx>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    const body = CreateBackup.parse(req.body ?? {});
    try {
      const result = await ctx.client.createBackup(ctx.slot, body);
      await auditFromReq(req, {
        action: 'server.backup.create',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, label: body.label },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.get(
  '/backups/:id',
  asyncHandler<SlotCtx & { id: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    try {
      const result = await ctx.client.getBackup(ctx.slot, req.params.id);
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.post(
  '/backups/:id/restore',
  asyncHandler<SlotCtx & { id: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    try {
      const result = await ctx.client.restoreBackup(ctx.slot, req.params.id);
      await auditFromReq(req, {
        action: 'server.backup.restore',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, id: req.params.id },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

serverActionsRouter.delete(
  '/backups/:id',
  asyncHandler<SlotCtx & { id: string }>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    try {
      const result = await ctx.client.deleteBackup(ctx.slot, req.params.id);
      await auditFromReq(req, {
        action: 'server.backup.delete',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, id: req.params.id },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

// ─── Server update ──────────────────────────────────────────────────────
serverActionsRouter.get(
  '/update',
  action('admin', ({ client, slot }, req) => {
    const mcVersion = typeof req.query.mc_version === 'string' ? req.query.mc_version : undefined;
    return client.serverUpdate(slot, mcVersion) as Promise<unknown>;
  }),
);

const ApplyUpdate = z.object({
  mc_version: z.string().min(1).max(32),
  backup: z.boolean().optional(),
});
serverActionsRouter.post(
  '/update',
  asyncHandler<SlotCtx>(async (req, res) => {
    const ctx = await resolveCtx(req);
    await assertGrant(req, ctx.instanceId, ctx.serverId, 'admin');
    const body = ApplyUpdate.parse(req.body);
    try {
      const result = await ctx.client.applyServerUpdate(ctx.slot, body);
      await auditFromReq(req, {
        action: 'server.update.apply',
        target: { instanceId: ctx.instanceId, slot: ctx.slot, mc_version: body.mc_version },
      });
      res.json(result);
    } catch (err) { throw mapMcsmError(err); }
  }),
);

function parseIntOpt(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
