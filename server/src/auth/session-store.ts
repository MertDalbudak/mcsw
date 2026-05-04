import { Store, type SessionData } from 'express-session';
import { prisma } from '../db.js';
import { logger } from '../logger.js';

type Cb<T = void> = (err: Error | null, value?: T) => void;

const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class PrismaSessionStore extends Store {
  private pruner: NodeJS.Timeout | undefined;

  constructor() {
    super();
    this.pruner = setInterval(() => {
      this.prune().catch((err) => logger.warn({ err }, 'session prune failed'));
    }, PRUNE_INTERVAL_MS);
    this.pruner.unref?.();
  }

  override get = (sid: string, cb: Cb<SessionData | null>): void => {
    prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expiresAt.getTime() <= Date.now()) {
          prisma.session.delete({ where: { sid } }).catch(() => undefined);
          return cb(null, null);
        }
        try {
          const data = JSON.parse(row.data) as SessionData;
          cb(null, data);
        } catch (err) {
          cb(err as Error);
        }
      })
      .catch((err) => cb(err as Error));
  };

  override set = (sid: string, session: SessionData, cb?: Cb): void => {
    const expiresAt = this.computeExpiry(session);
    const data = JSON.stringify(session);
    prisma.session
      .upsert({
        where: { sid },
        create: { sid, data, expiresAt },
        update: { data, expiresAt },
      })
      .then(() => cb?.(null))
      .catch((err) => cb?.(err as Error));
  };

  override destroy = (sid: string, cb?: Cb): void => {
    prisma.session
      .delete({ where: { sid } })
      .then(() => cb?.(null))
      .catch((err) => {
        // Deleting a non-existent session is not an error.
        if ((err as { code?: string }).code === 'P2025') return cb?.(null);
        cb?.(err as Error);
      });
  };

  override touch = (sid: string, session: SessionData, cb?: Cb): void => {
    const expiresAt = this.computeExpiry(session);
    prisma.session
      .update({ where: { sid }, data: { expiresAt } })
      .then(() => cb?.(null))
      .catch((err) => {
        if ((err as { code?: string }).code === 'P2025') return cb?.(null);
        cb?.(err as Error);
      });
  };

  override length = (cb: Cb<number>): void => {
    prisma.session
      .count()
      .then((n) => cb(null, n))
      .catch((err) => cb(err as Error));
  };

  override clear = (cb?: Cb): void => {
    prisma.session
      .deleteMany()
      .then(() => cb?.(null))
      .catch((err) => cb?.(err as Error));
  };

  private computeExpiry(session: SessionData): Date {
    const ms = session.cookie?.maxAge;
    return new Date(Date.now() + (typeof ms === 'number' ? ms : 24 * 60 * 60 * 1000));
  }

  private async prune(): Promise<void> {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) logger.debug({ count }, 'pruned expired sessions');
  }
}
