import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';
import { generateToken } from '../auth/tokens.js';

export const invitationsRouter = Router();
invitationsRouter.use(requireAuth);

// Any authenticated user can list their own invitations.
invitationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.currentUser!.isAdmin
      ? {}
      : { createdById: req.currentUser!.id };
    const rows = await prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        consumedBy: { select: { id: true, email: true } },
      },
    });
    res.json({
      invitations: rows.map((r) => ({
        id: r.id,
        code: r.code,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        consumedAt: r.consumedAt,
        consumedBy: r.consumedBy ? { id: r.consumedBy.id, email: r.consumedBy.email } : null,
        note: r.note,
      })),
    });
  }),
);

const CreateBody = z.object({
  expiresInDays: z.number().int().positive().max(365).optional(),
  note: z.string().max(280).optional(),
});

// Currently only admins create invitations. Down the line we can grant
// `canInvite` per-server and let trusted users invite to specific servers.
invitationsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = CreateBody.parse(req.body ?? {});
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    const inv = await prisma.invitation.create({
      data: {
        code: generateToken(16),
        createdById: req.currentUser!.id,
        expiresAt,
        note: body.note ?? null,
      },
    });
    await auditFromReq(req, { action: 'invite.create', target: { invitationId: inv.id } });
    res.status(201).json({
      id: inv.id,
      code: inv.code,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      note: inv.note,
    });
  }),
);

invitationsRouter.delete(
  '/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    const inv = await prisma.invitation.findUnique({ where: { id: req.params.id } });
    if (!inv) throw Errors.notFound('Invitation not found');
    if (inv.consumedAt) throw Errors.conflict('already_used', 'Cannot delete a used invitation');
    if (!req.currentUser!.isAdmin && inv.createdById !== req.currentUser!.id) {
      throw Errors.forbidden();
    }
    await prisma.invitation.delete({ where: { id: inv.id } });
    await auditFromReq(req, { action: 'invite.delete', target: { invitationId: inv.id } });
    res.json({ ok: true });
  }),
);
