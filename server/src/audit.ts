import type { Request } from 'express';
import { prisma } from './db.js';
import { logger } from './logger.js';

export interface AuditEntry {
  action: string;
  result?: 'ok' | 'error';
  errorCode?: string;
  target?: Record<string, unknown>;
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        result: entry.result ?? 'ok',
        errorCode: entry.errorCode ?? null,
        target: entry.target ? JSON.stringify(entry.target) : null,
        actorUserId: entry.actorUserId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit failures must never break the request path.
    logger.warn({ err, entry }, 'audit log write failed');
  }
}

export function auditFromReq(req: Request, entry: Omit<AuditEntry, 'actorUserId' | 'ip' | 'userAgent'>): Promise<void> {
  return audit({
    ...entry,
    actorUserId: req.currentUser?.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
}
