import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { invalidateFleet } from './fleet.js';

/**
 * Parse `MCSM_BOOTSTRAP=name|url|token,name|url|token,...` and ensure each
 * entry exists in the DB. Updates token/url on already-present rows so an
 * env-driven rotation works without touching the admin UI.
 */
export async function applyBootstrap(): Promise<void> {
  const raw = config.MCSM_BOOTSTRAP.trim();
  if (!raw) return;
  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split('|').map((p) => p.trim());
      return {
        name: parts[0] ?? '',
        baseUrl: parts[1] ?? '',
        token: parts[2] ?? '',
      };
    });

  let touched = 0;
  for (const e of entries) {
    if (!e.name || !e.baseUrl) {
      logger.warn({ entry: e }, 'invalid MCSM_BOOTSTRAP entry, skipping');
      continue;
    }
    await prisma.mcsmInstance.upsert({
      where: { name: e.name },
      create: {
        name: e.name,
        baseUrl: e.baseUrl,
        authToken: e.token,
        source: 'manual',
        enabled: true,
      },
      update: {
        baseUrl: e.baseUrl,
        authToken: e.token,
      },
    });
    touched++;
  }
  if (touched > 0) {
    invalidateFleet();
    logger.info({ count: touched }, 'mcsm bootstrap applied');
  }
}
