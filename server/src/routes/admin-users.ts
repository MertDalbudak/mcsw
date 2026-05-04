import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAdmin } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAdmin);

adminUsersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { mojangAccount: { select: { uuid: true, username: true } } },
    });
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        emailVerified: u.emailVerifiedAt != null,
        isAdmin: u.isAdmin,
        isDisabled: u.isDisabled,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        mojang: u.mojangAccount
          ? { uuid: u.mojangAccount.uuid, username: u.mojangAccount.username }
          : null,
      })),
    });
  }),
);

const PatchBody = z.object({
  isAdmin: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
});

adminUsersRouter.patch(
  '/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    const body = PatchBody.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw Errors.notFound();

    // Don't let admins demote/disable themselves — leaves the platform without an admin.
    if (target.id === req.currentUser!.id) {
      if (body.isAdmin === false) throw Errors.badRequest("Can't demote yourself");
      if (body.isDisabled === true) throw Errors.badRequest("Can't disable yourself");
    }

    // Don't let admins demote the last remaining admin.
    if (body.isAdmin === false && target.isAdmin) {
      const adminCount = await prisma.user.count({ where: { isAdmin: true, isDisabled: false } });
      if (adminCount <= 1) throw Errors.badRequest("Can't demote the last admin");
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isAdmin: body.isAdmin ?? undefined, isDisabled: body.isDisabled ?? undefined },
    });
    await auditFromReq(req, { action: 'admin.user_update', target: { userId: updated.id, ...body } });
    res.json({
      id: updated.id,
      email: updated.email,
      isAdmin: updated.isAdmin,
      isDisabled: updated.isDisabled,
    });
  }),
);

adminUsersRouter.delete(
  '/:id',
  asyncHandler<{ id: string }>(async (req, res) => {
    if (req.params.id === req.currentUser!.id) throw Errors.badRequest("Can't delete yourself");
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw Errors.notFound();
    await prisma.user.delete({ where: { id: target.id } });
    await auditFromReq(req, { action: 'admin.user_delete', target: { userId: target.id } });
    res.json({ ok: true });
  }),
);
