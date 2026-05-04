import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { hashPassword, validatePassword, verifyPassword } from '../auth/passwords.js';
import { requireAuth } from '../auth/middleware.js';
import { auditFromReq } from '../audit.js';
import { lookupByName, formatUuid } from '../mojang/api.js';

export const meRouter = Router();

meRouter.use(requireAuth);

// ─── GET /me ────────────────────────────────────────────────────────────
meRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: req.currentUser!.id },
      include: { mojangAccount: true },
    });
    res.json({
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerifiedAt != null,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      mojang: u.mojangAccount
        ? {
            uuid: formatUuid(u.mojangAccount.uuid),
            username: u.mojangAccount.username,
            linkedAt: u.mojangAccount.linkedAt,
            verified: u.mojangAccount.verifiedAt != null,
          }
        : null,
    });
  }),
);

// ─── POST /me/password ──────────────────────────────────────────────────
const ChangePwBody = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(1).max(200),
});

meRouter.post(
  '/password',
  asyncHandler(async (req, res) => {
    const body = ChangePwBody.parse(req.body);
    const pwError = validatePassword(body.next);
    if (pwError) throw Errors.badRequest(pwError);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    const ok = await verifyPassword(body.current, u.passwordHash);
    if (!ok) throw Errors.unauthorized('Current password is wrong');
    const passwordHash = await hashPassword(body.next);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash } });
    await auditFromReq(req, { action: 'me.password_change' });
    res.json({ ok: true });
  }),
);

// ─── Mojang link/unlink ─────────────────────────────────────────────────
const LinkBody = z.object({ username: z.string().min(3).max(16) });

meRouter.post(
  '/mojang',
  asyncHandler(async (req, res) => {
    const { username } = LinkBody.parse(req.body);
    const profile = await lookupByName(username);
    if (!profile) throw Errors.notFound('Mojang account not found');
    // One Mojang per user, one user per Mojang.
    const existingForUser = await prisma.mojangAccount.findUnique({
      where: { userId: req.currentUser!.id },
    });
    if (existingForUser) {
      throw Errors.conflict('mojang_already_linked', 'Unlink the current Mojang account first');
    }
    const existingForUuid = await prisma.mojangAccount.findUnique({ where: { uuid: profile.uuid } });
    if (existingForUuid) {
      throw Errors.conflict('mojang_in_use', 'This Mojang account is already linked to another user');
    }
    const link = await prisma.mojangAccount.create({
      data: {
        userId: req.currentUser!.id,
        uuid: profile.uuid,
        username: profile.username,
        // Auto-verified at link time. Future improvement: ownership challenge
        // (server-pings + chat handshake) before flipping to verified.
        verifiedAt: new Date(),
      },
    });
    await auditFromReq(req, {
      action: 'me.mojang_link',
      target: { uuid: profile.uuid, username: profile.username },
    });
    res.status(201).json({
      uuid: formatUuid(link.uuid),
      username: link.username,
      linkedAt: link.linkedAt,
      verified: link.verifiedAt != null,
    });
  }),
);

meRouter.delete(
  '/mojang',
  asyncHandler(async (req, res) => {
    await prisma.mojangAccount.delete({ where: { userId: req.currentUser!.id } }).catch((err) => {
      if ((err as { code?: string }).code === 'P2025') throw Errors.notFound('No Mojang account linked');
      throw err;
    });
    await auditFromReq(req, { action: 'me.mojang_unlink' });
    res.json({ ok: true });
  }),
);
