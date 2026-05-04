import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { Errors } from '../error.js';
import { asyncHandler } from '../lib/async.js';
import type { CurrentUser } from './types.js';

export const loadCurrentUser = asyncHandler(async (req, _res, next) => {
  const userId = req.session.userId;
  if (!userId) return next();
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || u.isDisabled) {
    req.session.userId = undefined;
    return next();
  }
  const cu: CurrentUser = {
    id: u.id,
    email: u.email,
    isAdmin: u.isAdmin,
    emailVerified: u.emailVerifiedAt != null,
  };
  req.currentUser = cu;
  next();
});

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.currentUser) return next(Errors.unauthorized('Sign in required'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.currentUser) return next(Errors.unauthorized('Sign in required'));
  if (!req.currentUser.isAdmin) return next(Errors.forbidden('Admin access required'));
  next();
}

export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): void {
  if (!req.currentUser) return next(Errors.unauthorized('Sign in required'));
  if (!req.currentUser.emailVerified) return next(Errors.forbidden('Email verification required'));
  next();
}
