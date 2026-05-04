import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import { hashPassword, validatePassword, verifyPassword } from '../auth/passwords.js';
import { generateToken, hashToken } from '../auth/tokens.js';
import { auditFromReq } from '../audit.js';
import { sendMail, emailLink } from '../mail/mailer.js';
import { signinRateLimit, authRateLimit } from '../auth/rate-limit.js';
import { generateCsrfToken } from '../auth/csrf.js';

export const authRouter = Router();

// ─── /csrf ───────────────────────────────────────────────────────────────
// The Vue app calls this on boot to obtain a CSRF token which is then sent
// on every mutating request as an `X-CSRF-Token` header.
authRouter.get('/csrf', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

// ─── /signup ─────────────────────────────────────────────────────────────
const SignupBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  invitationCode: z.string().min(1).max(64).optional(),
});

authRouter.post(
  '/signup',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const body = SignupBody.parse(req.body);
    const email = body.email.toLowerCase();

    const pwError = validatePassword(body.password);
    if (pwError) throw Errors.badRequest(pwError);

    let invitation = null;
    if (config.SIGNUP_REQUIRES_INVITE) {
      if (!body.invitationCode) throw Errors.badRequest('Invitation code required');
      invitation = await prisma.invitation.findUnique({ where: { code: body.invitationCode } });
      if (!invitation) throw Errors.badRequest('Invalid invitation code');
      if (invitation.consumedAt) throw Errors.badRequest('Invitation already used');
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        throw Errors.badRequest('Invitation has expired');
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw Errors.conflict('email_taken', 'Email already registered');

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          // First-ever user becomes admin automatically.
          isAdmin: (await tx.user.count()) === 0,
        },
      });
      if (invitation) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { consumedById: u.id, consumedAt: new Date() },
        });
      }
      return u;
    });

    if (config.EMAIL_VERIFICATION_REQUIRED) {
      const token = generateToken();
      await prisma.emailToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          purpose: 'verify_email',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const link = emailLink(`/verify-email?token=${encodeURIComponent(token)}`);
      await sendMail({
        to: user.email,
        subject: 'Verify your mcsw account',
        text: `Click to verify your email: ${link}\n\nLink expires in 24 hours.`,
      });
    }

    req.session.userId = user.id;
    await auditFromReq(req, { action: 'auth.signup', target: { userId: user.id } });
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
        emailVerified: user.emailVerifiedAt != null,
      },
    });
  }),
);

// ─── /signin ─────────────────────────────────────────────────────────────
const SigninBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

authRouter.post(
  '/signin',
  signinRateLimit,
  asyncHandler(async (req, res) => {
    const body = SigninBody.parse(req.body);
    const email = body.email.toLowerCase();
    const u = await prisma.user.findUnique({ where: { email } });

    // Constant-ish-time response: always run a hash compare.
    const dummy = '$2b$12$0000000000000000000000000000000000000000000000000000';
    const ok = u && !u.isDisabled
      ? await verifyPassword(body.password, u.passwordHash)
      : (await verifyPassword(body.password, dummy), false);

    if (!u || !ok || u.isDisabled) {
      await auditFromReq(req, { action: 'auth.signin', result: 'error', errorCode: 'invalid_credentials' });
      throw Errors.unauthorized('Invalid email or password');
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: { code: 'internal', message: 'Session error' } });
      req.session.userId = u.id;
      prisma.user
        .update({ where: { id: u.id }, data: { lastLoginAt: new Date() } })
        .catch(() => undefined);
      auditFromReq(req, { action: 'auth.signin', target: { userId: u.id } });
      res.json({
        user: {
          id: u.id,
          email: u.email,
          isAdmin: u.isAdmin,
          emailVerified: u.emailVerifiedAt != null,
        },
      });
    });
  }),
);

// ─── /signout ────────────────────────────────────────────────────────────
authRouter.post(
  '/signout',
  asyncHandler(async (req, res) => {
    const userId = req.currentUser?.id;
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: { code: 'internal', message: 'Session error' } });
      res.clearCookie('mcsw.sid');
      if (userId) audit_signout(req, userId).catch(() => undefined);
      res.json({ ok: true });
    });
  }),
);

async function audit_signout(req: import('express').Request, userId: string): Promise<void> {
  await auditFromReq(req, { action: 'auth.signout', target: { userId } });
}

// ─── /verify-email ───────────────────────────────────────────────────────
const VerifyBody = z.object({ token: z.string().min(1).max(200) });

authRouter.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = VerifyBody.parse(req.body);
    const tokenHash = hashToken(token);
    const row = await prisma.emailToken.findUnique({ where: { tokenHash } });
    if (!row || row.purpose !== 'verify_email') throw Errors.badRequest('Invalid or expired token');
    if (row.consumedAt) throw Errors.badRequest('Token already used');
    if (row.expiresAt < new Date()) throw Errors.badRequest('Token has expired');
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
      prisma.emailToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
    ]);
    await auditFromReq(req, { action: 'auth.verify_email', target: { userId: row.userId } });
    res.json({ ok: true });
  }),
);

// ─── /password-reset/request ─────────────────────────────────────────────
const ResetReqBody = z.object({ email: z.string().email().max(254) });

authRouter.post(
  '/password-reset/request',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const { email } = ResetReqBody.parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Don't reveal whether the email exists; always respond ok.
    if (u && !u.isDisabled) {
      const token = generateToken();
      await prisma.passwordReset.create({
        data: {
          userId: u.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const link = emailLink(`/reset-password?token=${encodeURIComponent(token)}`);
      await sendMail({
        to: u.email,
        subject: 'Reset your mcsw password',
        text: `Reset link (valid 1 hour): ${link}\n\nIf you didn't request this, ignore this email.`,
      });
      await auditFromReq(req, { action: 'auth.password_reset_request', target: { userId: u.id } });
    }
    res.json({ ok: true });
  }),
);

// ─── /password-reset/confirm ─────────────────────────────────────────────
const ResetConfirmBody = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

authRouter.post(
  '/password-reset/confirm',
  asyncHandler(async (req, res) => {
    const body = ResetConfirmBody.parse(req.body);
    const pwError = validatePassword(body.password);
    if (pwError) throw Errors.badRequest(pwError);
    const tokenHash = hashToken(body.token);
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!row) throw Errors.badRequest('Invalid or expired token');
    if (row.consumedAt) throw Errors.badRequest('Token already used');
    if (row.expiresAt < new Date()) throw Errors.badRequest('Token has expired');
    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.passwordReset.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
      // Best-effort: invalidate all sessions for this user.
      prisma.session.deleteMany({ where: { data: { contains: `"userId":"${row.userId}"` } } }),
    ]);
    await auditFromReq(req, { action: 'auth.password_reset', target: { userId: row.userId } });
    res.json({ ok: true });
  }),
);
