import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAdmin } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';
import { invalidateFleet } from '../mcsm/fleet.js';
import { probeAddress, scanLan, recordDiscoveries } from '../mcsm/scanner.js';
import { McsmClient } from '../mcsm/client.js';

export const mcsmInstancesRouter = Router();
mcsmInstancesRouter.use(requireAdmin);

mcsmInstancesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.mcsmInstance.findMany({ orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    res.json({
      instances: rows.map((r) => ({
        id: r.id,
        name: r.name,
        baseUrl: r.baseUrl,
        // Token never leaves the server.
        hasToken: r.authToken.length > 0,
        isPrimary: r.isPrimary,
        enabled: r.enabled,
        source: r.source,
        notes: r.notes,
        lastSeenAt: r.lastSeenAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
      })),
    });
  }),
);

const CreateBody = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'lowercase, digits, dashes only'),
  baseUrl: z.string().url(),
  authToken: z.string().min(1).max(512),
  isPrimary: z.boolean().optional(),
  enabled: z.boolean().optional(),
  notes: z.string().max(280).optional(),
});

mcsmInstancesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = CreateBody.parse(req.body);
    const dup = await prisma.mcsmInstance.findUnique({ where: { name: body.name } });
    if (dup) throw Errors.conflict('name_taken', 'Name already in use');
    const inst = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.mcsmInstance.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
      }
      return tx.mcsmInstance.create({
        data: {
          name: body.name,
          baseUrl: body.baseUrl,
          authToken: body.authToken,
          isPrimary: body.isPrimary ?? false,
          enabled: body.enabled ?? true,
          source: 'manual',
          notes: body.notes ?? null,
        },
      });
    });
    invalidateFleet();
    await auditFromReq(req, { action: 'mcsm.create', target: { id: inst.id, name: inst.name } });
    res.status(201).json(toPublic(inst));
  }),
);

const UpdateBody = CreateBody.partial();

mcsmInstancesRouter.patch(
  '/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    const body = UpdateBody.parse(req.body);
    const existing = await prisma.mcsmInstance.findUnique({ where: { id: req.params.id } });
    if (!existing) throw Errors.notFound('Instance not found');
    const updated = await prisma.$transaction(async (tx) => {
      if (body.isPrimary === true) {
        await tx.mcsmInstance.updateMany({
          where: { isPrimary: true, NOT: { id: existing.id } },
          data: { isPrimary: false },
        });
      }
      return tx.mcsmInstance.update({
        where: { id: existing.id },
        data: {
          name: body.name ?? undefined,
          baseUrl: body.baseUrl ?? undefined,
          authToken: body.authToken ?? undefined,
          isPrimary: body.isPrimary ?? undefined,
          enabled: body.enabled ?? undefined,
          notes: body.notes ?? undefined,
        },
      });
    });
    invalidateFleet();
    await auditFromReq(req, { action: 'mcsm.update', target: { id: updated.id } });
    res.json(toPublic(updated));
  }),
);

mcsmInstancesRouter.delete(
  '/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    const existing = await prisma.mcsmInstance.findUnique({ where: { id: req.params.id } });
    if (!existing) throw Errors.notFound();
    await prisma.mcsmInstance.delete({ where: { id: existing.id } });
    invalidateFleet();
    await auditFromReq(req, { action: 'mcsm.delete', target: { id: existing.id } });
    res.json({ ok: true });
  }),
);

// ─── Probe & scan helpers (admin tooling) ───────────────────────────────
const ProbeBody = z.object({ host: z.string().min(1), port: z.number().int().positive() });

mcsmInstancesRouter.post(
  '/probe',
  asyncHandler(async (req, res) => {
    const { host, port } = ProbeBody.parse(req.body);
    const result = await probeAddress(host, port);
    res.json({ result });
  }),
);

const TestBody = z.object({ baseUrl: z.string().url(), authToken: z.string().min(1) });

mcsmInstancesRouter.post(
  '/test-connection',
  asyncHandler(async (req, res) => {
    const { baseUrl, authToken } = TestBody.parse(req.body);
    const c = new McsmClient({ baseUrl, token: authToken });
    try {
      const info = await c.instance();
      res.json({ ok: true, instance: info });
    } catch (err) {
      res.json({ ok: false, error: (err as Error).message });
    }
  }),
);

mcsmInstancesRouter.post(
  '/scan',
  asyncHandler(async (req, res) => {
    const hits = await scanLan();
    const added = await recordDiscoveries(hits);
    await auditFromReq(req, { action: 'mcsm.scan', target: { hits: hits.length, added } });
    res.json({ hits, added });
  }),
);

function toPublic(r: { id: string; name: string; baseUrl: string; authToken: string; isPrimary: boolean; enabled: boolean; source: string; notes: string | null; lastSeenAt: Date | null; lastError: string | null; createdAt: Date }) {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.baseUrl,
    hasToken: r.authToken.length > 0,
    isPrimary: r.isPrimary,
    enabled: r.enabled,
    source: r.source,
    notes: r.notes,
    lastSeenAt: r.lastSeenAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
  };
}
