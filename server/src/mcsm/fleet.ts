import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { McsmClient } from './client.js';

interface FleetEntry {
  id: string;
  name: string;
  baseUrl: string;
  isPrimary: boolean;
  enabled: boolean;
  client: McsmClient;
}

const cache = new Map<string, FleetEntry>(); // keyed by instance id
let primaryId: string | null = null;
let lastSync = 0;
const TTL_MS = 30_000;

async function sync(force = false): Promise<void> {
  if (!force && Date.now() - lastSync < TTL_MS && cache.size > 0) return;
  const rows = await prisma.mcsmInstance.findMany({ where: { enabled: true } });
  cache.clear();
  primaryId = null;
  for (const row of rows) {
    cache.set(row.id, {
      id: row.id,
      name: row.name,
      baseUrl: row.baseUrl,
      isPrimary: row.isPrimary,
      enabled: row.enabled,
      client: new McsmClient({ baseUrl: row.baseUrl, token: row.authToken }),
    });
    if (row.isPrimary) primaryId = row.id;
  }
  // Fall back to any peer if no primary marked.
  if (!primaryId && cache.size > 0) primaryId = cache.keys().next().value ?? null;
  lastSync = Date.now();
  logger.debug({ count: cache.size, primary: primaryId }, 'mcsm fleet synced');
}

export async function getClient(instanceId: string): Promise<McsmClient | null> {
  await sync();
  return cache.get(instanceId)?.client ?? null;
}

export async function getClientByName(name: string): Promise<{ instance: FleetEntry; client: McsmClient } | null> {
  await sync();
  for (const e of cache.values()) {
    if (e.name === name) return { instance: e, client: e.client };
  }
  return null;
}

export async function getPrimary(): Promise<{ instance: FleetEntry; client: McsmClient } | null> {
  await sync();
  if (!primaryId) return null;
  const e = cache.get(primaryId);
  return e ? { instance: e, client: e.client } : null;
}

export async function listInstances(): Promise<FleetEntry[]> {
  await sync();
  return [...cache.values()];
}

export function invalidateFleet(): void {
  lastSync = 0;
  invalidateFederationCache();
}

// ─── Federation cache ────────────────────────────────────────────────────
// mcsm spec recommends caching `/federation/discovery` for ~5s and
// invalidating on every mutation. We cache both federation reads.
const FED_TTL_MS = 5_000;
const fedCache = new Map<'discovery' | 'slots', { at: number; data: unknown }>();

export async function cachedFederationDiscovery(): Promise<unknown | null> {
  return cachedFederation('discovery', (c) => c.federationDiscovery());
}
export async function cachedFederationSlots(): Promise<unknown | null> {
  return cachedFederation('slots', (c) => c.federationSlots());
}
async function cachedFederation(
  key: 'discovery' | 'slots',
  fn: (c: McsmClient) => Promise<unknown>,
): Promise<unknown | null> {
  const hit = fedCache.get(key);
  if (hit && Date.now() - hit.at < FED_TTL_MS) return hit.data;
  const primary = await getPrimary();
  if (!primary) return null;
  const data = await fn(primary.client);
  fedCache.set(key, { at: Date.now(), data });
  return data;
}
export function invalidateFederationCache(): void {
  fedCache.clear();
}

/**
 * Probe each peer with /api/v1/instance and update lastSeenAt / lastError.
 * Cheap; safe to call on a timer.
 */
export async function probeAll(): Promise<void> {
  await sync(true);
  await Promise.all(
    [...cache.values()].map(async (e) => {
      try {
        await e.client.instance();
        await prisma.mcsmInstance.update({
          where: { id: e.id },
          data: { lastSeenAt: new Date(), lastError: null },
        });
      } catch (err) {
        await prisma.mcsmInstance
          .update({
            where: { id: e.id },
            data: { lastError: (err as Error).message },
          })
          .catch(() => undefined);
      }
    }),
  );
}
