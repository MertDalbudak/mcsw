import { Router } from 'express';
import { Errors, HttpError } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAdmin } from '../auth/middleware.js';
import { getClient, listInstances } from '../mcsm/fleet.js';
import { McsmError } from '../mcsm/client.js';

export const systemRouter = Router();
systemRouter.use(requireAdmin);

// ─── GET / — overview across all peers ──────────────────────────────────
// Returns one entry per configured mcsm instance with reachability +
// resources + temperature (any of which may be null on individual
// failures).
systemRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const instances = await listInstances();
    const out = await Promise.all(
      instances.map(async (inst) => {
        const [resources, temperature] = await Promise.all([
          inst.client.systemResources().catch((err) => ({ _error: extractMessage(err) })),
          inst.client.systemTemperature().catch((err) => ({ _error: extractMessage(err) })),
        ]);
        return {
          instanceId: inst.id,
          name: inst.name,
          baseUrl: inst.baseUrl,
          resources,
          temperature,
        };
      }),
    );
    res.json({ instances: out });
  }),
);

// ─── Direct passthroughs (single instance) ──────────────────────────────
systemRouter.get(
  '/:instanceId/temperature',
  asyncHandler<{ instanceId: string }>(async (req, res) => {
    const client = await getClient(req.params.instanceId);
    if (!client) throw Errors.notFound('mcsm instance not found');
    try {
      res.json(await client.systemTemperature());
    } catch (err) { throw mapMcsmError(err); }
  }),
);

systemRouter.get(
  '/:instanceId/resources',
  asyncHandler<{ instanceId: string }>(async (req, res) => {
    const client = await getClient(req.params.instanceId);
    if (!client) throw Errors.notFound('mcsm instance not found');
    try {
      res.json(await client.systemResources());
    } catch (err) { throw mapMcsmError(err); }
  }),
);

function extractMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function mapMcsmError(err: unknown): unknown {
  if (err instanceof McsmError) {
    return new HttpError(err.status, err.code, err.message, err.details, { traceId: err.traceId });
  }
  return err;
}
