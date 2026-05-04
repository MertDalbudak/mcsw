import { PrismaClient } from './generated/prisma/client.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { config } from './config.js';
import { logger } from './logger.js';

const adapter = new PrismaBetterSqlite3({ url: config.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: config.isDev
    ? [{ emit: 'event', level: 'query' }, { emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
    : [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
});

if (config.isDev) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).$on('query', (e: { duration: number; query: string }) => {
    if (e.duration > 100) logger.debug({ ms: e.duration, query: e.query }, 'slow query');
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('warn', (e: { message: string }) => logger.warn(e.message));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('error', (e: { message: string }) => logger.error(e.message));

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
