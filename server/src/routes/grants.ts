import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';

export const grantsRouter = Router();
grantsRouter.use(requireAuth);

// Users see their own grants. Admins can see anyone's via ?userId=.
grantsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const targetUserId = (req.query.userId as string | undefined) ?? req.currentUser!.id;
    if (targetUserId !== req.currentUser!.id && !req.currentUser!.isAdmin) {
      throw Errors.forbidden();
    }
    const grants = await prisma.serverGrant.findMany({
      where: { userId: targetUserId },
      include: { mcsmInstance: { select: { id: true, name: true, baseUrl: true } } },
    });
    res.json({
      grants: grants.map((g) => ({
        id: g.id,
        userId: g.userId,
        instance: g.mcsmInstance,
        serverId: g.serverId,
        permissions: {
          start: g.canStart,
          stop: g.canStop,
          restart: g.canRestart,
          command: g.canCommand,
          moderate: g.canModerate,
          admin: g.canAdmin,
          invite: g.canInvite,
        },
        createdAt: g.createdAt,
      })),
    });
  }),
);

const PermBlock = z
  .object({
    start: z.boolean().optional(),
    stop: z.boolean().optional(),
    restart: z.boolean().optional(),
    command: z.boolean().optional(),
    moderate: z.boolean().optional(),
    admin: z.boolean().optional(),
    invite: z.boolean().optional(),
  })
  .default({});

const UpsertBody = z.object({
  userId: z.string().min(1),
  mcsmInstanceId: z.string().min(1),
  serverId: z.string().min(1),
  permissions: PermBlock,
});

grantsRouter.put(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = UpsertBody.parse(req.body);
    const data = {
      userId: body.userId,
      mcsmInstanceId: body.mcsmInstanceId,
      serverId: body.serverId,
      canStart: body.permissions.start ?? false,
      canStop: body.permissions.stop ?? false,
      canRestart: body.permissions.restart ?? false,
      canCommand: body.permissions.command ?? false,
      canModerate: body.permissions.moderate ?? false,
      canAdmin: body.permissions.admin ?? false,
      canInvite: body.permissions.invite ?? false,
    };
    const grant = await prisma.serverGrant.upsert({
      where: {
        userId_mcsmInstanceId_serverId: {
          userId: data.userId,
          mcsmInstanceId: data.mcsmInstanceId,
          serverId: data.serverId,
        },
      },
      create: data,
      update: data,
    });
    await auditFromReq(req, {
      action: 'grant.upsert',
      target: { grantId: grant.id, userId: data.userId, serverId: data.serverId },
    });
    res.json({ id: grant.id });
  }),
);

grantsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler<{ id: string }>(async (req, res) => {
    const grant = await prisma.serverGrant.findUnique({ where: { id: req.params.id } });
    if (!grant) throw Errors.notFound();
    await prisma.serverGrant.delete({ where: { id: grant.id } });
    await auditFromReq(req, { action: 'grant.delete', target: { grantId: grant.id } });
    res.json({ ok: true });
  }),
);
