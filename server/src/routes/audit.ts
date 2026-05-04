import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Errors, HttpError } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAdmin } from '../auth/middleware.js';
import { getClient } from '../mcsm/fleet.js';
import { McsmError } from '../mcsm/client.js';

export const auditRouter = Router();
auditRouter.use(requireAdmin);

// ─── GET /local — mcsw's own audit log ──────────────────────────────────
const LocalQuery = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  actor: z.string().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
  cursor: z.string().optional(),
});

auditRouter.get(
  '/local',
  asyncHandler(async (req, res) => {
    const q = LocalQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.since) where.ts = { ...(where.ts as object | undefined), gte: new Date(q.since) };
    if (q.until) where.ts = { ...(where.ts as object | undefined), lte: new Date(q.until) };
    if (q.action) where.action = q.action;
    if (q.actor) {
      const actor = await prisma.user.findUnique({ where: { email: q.actor.toLowerCase() } });
      where.actorUserId = actor?.id ?? '__no_match__';
    }
    if (q.cursor) where.id = { lt: q.cursor };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { ts: 'desc' },
      take: q.limit,
      include: { actor: { select: { id: true, email: true } } },
    });

    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        actor: r.actor ? { id: r.actor.id, email: r.actor.email } : null,
        action: r.action,
        target: r.target ? safeParse(r.target) : null,
        result: r.result,
        errorCode: r.errorCode,
        ip: r.ip,
        userAgent: r.userAgent,
      })),
      nextCursor: rows.length === q.limit ? rows[rows.length - 1]?.id ?? null : null,
    });
  }),
);

// ─── GET /:instanceId — pass through to mcsm's audit ────────────────────
const McsmQuery = z.object({
  since: z.string().optional(),
  until: z.string().optional(),
  actor: z.string().optional(),
  kind: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  cursor: z.string().optional(),
});

auditRouter.get(
  '/:instanceId',
  asyncHandler<{ instanceId: string }>(async (req, res) => {
    const q = McsmQuery.parse(req.query);
    const client = await getClient(req.params.instanceId);
    if (!client) throw Errors.notFound('mcsm instance not found');
    try {
      const result = await client.audit(q);
      res.json(result);
    } catch (err) {
      if (err instanceof McsmError) {
        throw new HttpError(err.status, err.code, err.message, err.details, { traceId: err.traceId });
      }
      throw err;
    }
  }),
);

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
