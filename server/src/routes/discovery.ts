import { Router } from 'express';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAuth } from '../auth/middleware.js';
import {
  getClient, listInstances,
  cachedFederationDiscovery, invalidateFederationCache,
} from '../mcsm/fleet.js';
import { McsmError } from '../mcsm/client.js';

export const discoveryRouter = Router();
discoveryRouter.use(requireAuth);

interface FedSource { instance: string; self?: boolean; ok: boolean; rtt_ms?: number; error?: string }
interface DiscoveredServer {
  id: string;
  name: string;
  type: string;
  version: string;
  ownership?: { state: string; instance?: string };
}

// ─── GET / ──────────────────────────────────────────────────────────────
// Federated discovery view. Returns the federation shape:
//   { scanned_at, sources: [...], servers: [...] }
// regardless of whether the data came from `/federation/discovery` (one
// round-trip) or per-peer fan-out (fallback).
discoveryRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      const fed = await cachedFederationDiscovery();
      if (fed) return res.json(fed);
    } catch (err) {
      if (!(err instanceof McsmError) || err.status !== 404) throw err;
    }
    // Fan-out fallback. Dedupe by server id (a server may show up on
    // multiple peers if they share a discovery_root).
    const instances = await listInstances();
    const sources: FedSource[] = [];
    const servers = new Map<string, DiscoveredServer>();
    await Promise.all(
      instances.map(async (inst) => {
        try {
          const d = (await inst.client.discovery()) as { servers?: DiscoveredServer[] };
          for (const s of d.servers ?? []) servers.set(s.id, s);
          sources.push({ instance: inst.name, ok: true });
        } catch (err) {
          sources.push({ instance: inst.name, ok: false, error: (err as Error).message });
        }
      }),
    );
    res.json({
      scanned_at: new Date().toISOString(),
      sources,
      servers: [...servers.values()],
    });
  }),
);

discoveryRouter.post(
  '/:instanceId/refresh',
  asyncHandler<{ instanceId: string }>(async (req, res) => {
    const client = await getClient(req.params.instanceId);
    if (!client) throw Errors.notFound();
    const result = await client.refreshDiscovery();
    invalidateFederationCache();
    res.json(result);
  }),
);
