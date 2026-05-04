import { networkInterfaces } from 'node:os';
import { connect } from 'node:net';
import { request } from 'undici';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { invalidateFleet } from './fleet.js';

const TCP_TIMEOUT_MS = 250;
const HTTP_TIMEOUT_MS = 1500;

interface ScanResult {
  host: string;
  port: number;
  baseUrl: string;
  instanceName?: string;
  version?: string;
  reachable: boolean;
  authRequired: boolean;
}

/** Compute the /24 ranges from each non-loopback IPv4 interface. */
function localSubnets(): string[][] {
  const subnets: string[][] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const parts = i.address.split('.');
      if (parts.length !== 4) continue;
      const prefix = parts.slice(0, 3).join('.');
      const range: string[] = [];
      for (let n = 1; n < 255; n++) range.push(`${prefix}.${n}`);
      subnets.push(range);
    }
  }
  return subnets;
}

function probeTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, TCP_TIMEOUT_MS);
    sock.once('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Hit /api/v1/instance unauthenticated. mcsm returns 401 for an open port
 * with auth required, or 200 with identity. Both confirm "this is mcsm".
 */
async function probeMcsm(host: string, port: number): Promise<ScanResult | null> {
  const baseUrl = `http://${host}:${port}`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
    const res = await request(`${baseUrl}/api/v1/instance`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (res.statusCode === 401) {
      return { host, port, baseUrl, reachable: true, authRequired: true };
    }
    if (res.statusCode !== 200) return null;
    const body = (await res.body.json()) as { name?: string; version?: string };
    if (!body || typeof body !== 'object') return null;
    return {
      host,
      port,
      baseUrl,
      instanceName: body.name,
      version: body.version,
      reachable: true,
      authRequired: false,
    };
  } catch {
    return null;
  }
}

/** Scan one /24 in parallel. Returns only confirmed mcsm hits. */
async function scanRange(range: string[], port: number): Promise<ScanResult[]> {
  const open: string[] = [];
  await Promise.all(
    range.map(async (host) => {
      if (await probeTcp(host, port)) open.push(host);
    }),
  );
  const hits: ScanResult[] = [];
  for (const host of open) {
    const result = await probeMcsm(host, port);
    if (result) hits.push(result);
  }
  return hits;
}

export async function scanLan(): Promise<ScanResult[]> {
  if (!config.MCSM_SCAN_ENABLED) return [];
  const subnets = localSubnets();
  const ports = config.scanPorts;
  const all: ScanResult[] = [];
  for (const port of ports) {
    for (const subnet of subnets) {
      const hits = await scanRange(subnet, port);
      all.push(...hits);
    }
  }
  return all;
}

/**
 * Scan a single user-supplied host:port (which may be remote, not LAN).
 * Used by the admin "test connection" UI before persisting.
 */
export async function probeAddress(host: string, port: number): Promise<ScanResult | null> {
  const tcpOk = await probeTcp(host, port);
  if (!tcpOk) return { host, port, baseUrl: `http://${host}:${port}`, reachable: false, authRequired: false };
  return probeMcsm(host, port);
}

/**
 * Persist scan hits as discovered instances. Skips ones we already have
 * (matched by baseUrl). Returns number of new entries.
 */
export async function recordDiscoveries(hits: ScanResult[]): Promise<number> {
  let added = 0;
  for (const h of hits) {
    const existing = await prisma.mcsmInstance.findFirst({ where: { baseUrl: h.baseUrl } });
    if (existing) continue;
    // Discovered entries land disabled until an admin supplies a token.
    const baseName = h.instanceName ?? `discovered-${h.host}-${h.port}`;
    const name = await uniqueName(baseName);
    await prisma.mcsmInstance.create({
      data: {
        name,
        baseUrl: h.baseUrl,
        authToken: '',
        enabled: false,
        source: 'discovered',
        notes: h.authRequired ? 'Auth required — supply a token to enable' : 'Discovered via LAN scan',
      },
    });
    added++;
  }
  if (added > 0) invalidateFleet();
  return added;
}

async function uniqueName(base: string): Promise<string> {
  let candidate = base;
  let i = 2;
  while (await prisma.mcsmInstance.findUnique({ where: { name: candidate } })) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

let scanTimer: NodeJS.Timeout | null = null;

export function startScannerLoop(): void {
  if (!config.MCSM_SCAN_ENABLED) return;
  const tick = async (): Promise<void> => {
    try {
      const hits = await scanLan();
      const added = await recordDiscoveries(hits);
      if (added > 0) logger.info({ added }, 'LAN scan added new mcsm instances');
    } catch (err) {
      logger.warn({ err }, 'LAN scan failed');
    }
  };
  // Fire once shortly after startup, then on the configured interval.
  setTimeout(() => { void tick(); }, 5_000).unref?.();
  scanTimer = setInterval(() => { void tick(); }, config.MCSM_SCAN_INTERVAL_MS);
  scanTimer.unref?.();
}

export function stopScannerLoop(): void {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = null;
}
