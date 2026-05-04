import { request } from 'undici';
import { randomUUID } from 'node:crypto';
import { Errors } from '../error.js';

export interface McsmClientOptions {
  baseUrl: string;
  token: string;
  /** Default request timeout in ms. */
  timeoutMs?: number;
}

export interface McsmRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | string[]>;
  idempotent?: boolean;
  signal?: AbortSignal;
}

export class McsmError extends Error {
  status: number;
  code: string;
  details?: unknown;
  traceId?: string;
  /** Seconds to wait before retry, if mcsm sent a Retry-After header (429). */
  retryAfter?: number;
  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    traceId?: string,
    retryAfter?: number,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
    this.retryAfter = retryAfter;
  }
}

/**
 * Thin REST client for the mcsm v1 API. One instance == one mcsm peer.
 *
 * The client never throws on network success with a non-2xx — it raises
 * `McsmError` carrying mcsm's `error.code` so route handlers can map them
 * to HTTP responses cleanly.
 */
export class McsmClient {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(opts: McsmClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  /** Shared HTTP entry point. */
  async req<T = unknown>(path: string, opts: McsmRequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
        else url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotent) headers['Idempotency-Key'] = randomUUID();

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    if (opts.signal) opts.signal.addEventListener('abort', () => ac.abort(), { once: true });

    let response;
    try {
      response = await request(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ac.signal,
      });
    } catch (err) {
      throw Errors.upstream(`mcsm unreachable: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.body.text();
    const json = text ? safeParseJson(text) : null;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return json as T;
    }

    // mcsm puts trace_id inside error per spec (§1.8); also tolerate the
    // alternate top-level placement seen in earlier drafts.
    const errBody = (json ?? {}) as {
      error?: { code?: string; message?: string; details?: unknown; trace_id?: string };
      trace_id?: string;
    };
    const retryAfterRaw = response.headers['retry-after'];
    const retryAfter = typeof retryAfterRaw === 'string' ? Number.parseInt(retryAfterRaw, 10) : undefined;
    throw new McsmError(
      response.statusCode,
      errBody.error?.code ?? 'upstream_error',
      errBody.error?.message ?? `mcsm returned ${response.statusCode}`,
      errBody.error?.details,
      errBody.error?.trace_id ?? errBody.trace_id,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  // ─── Identity & health ─────────────────────────────────────────────────
  instance() { return this.req('/api/v1/instance'); }
  ready()    { return this.req('/readyz'); }

  // ─── Discovery ─────────────────────────────────────────────────────────
  discovery(query?: { state?: string[]; type?: string[] }) {
    return this.req('/api/v1/discovery', { query });
  }
  refreshDiscovery() {
    return this.req('/api/v1/discovery/refresh', { method: 'POST', idempotent: true });
  }
  releaseLock(serverId: string, force = false) {
    return this.req(`/api/v1/discovery/${encodeURIComponent(serverId)}/lock`, {
      method: 'DELETE',
      query: force ? { force: true } : undefined,
    });
  }

  // ─── Federation ────────────────────────────────────────────────────────
  federationDiscovery() { return this.req('/api/v1/federation/discovery'); }
  federationSlots()     { return this.req('/api/v1/federation/slots'); }
  peers()               { return this.req('/api/v1/peers'); }
  peersRefresh()        { return this.req('/api/v1/peers/refresh', { method: 'POST', idempotent: true }); }

  // ─── Slots ─────────────────────────────────────────────────────────────
  slots()              { return this.req('/api/v1/slots'); }
  slot(name: string)   { return this.req(`/api/v1/slots/${encodeURIComponent(name)}`); }
  startSlot(name: string, body: { server_id: string; force?: boolean }) {
    return this.req(`/api/v1/slots/${encodeURIComponent(name)}/start`, {
      method: 'POST', body, idempotent: true,
    });
  }
  stopSlot(name: string, body?: { graceful_seconds?: number; broadcast_every?: number; broadcast_template?: string }) {
    return this.req(`/api/v1/slots/${encodeURIComponent(name)}/stop`, {
      method: 'POST', body: body ?? {}, idempotent: true,
    });
  }
  restartSlot(name: string, body?: { graceful_seconds?: number; broadcast_every?: number; broadcast_template?: string }) {
    return this.req(`/api/v1/slots/${encodeURIComponent(name)}/restart`, {
      method: 'POST', body: body ?? {}, idempotent: true,
    });
  }
  abortStop(name: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(name)}/abort-stop`, { method: 'POST' });
  }
  compatibleServers(name: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(name)}/compatible-servers`);
  }

  // ─── Mounted server ────────────────────────────────────────────────────
  command(slot: string, command: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/command`, {
      method: 'POST', body: { command },
    });
  }
  say(slot: string, message: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/say`, {
      method: 'POST', body: { message },
    });
  }
  players(slot: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/players`);
  }
  kick(slot: string, player: string, reason?: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/kick`,
      { method: 'POST', body: { reason } },
    );
  }
  ban(slot: string, player: string, body: { reason?: string; duration?: string; ban_ip?: boolean }) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/ban`,
      { method: 'POST', body },
    );
  }
  unban(slot: string, player: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/unban`,
      { method: 'POST' },
    );
  }
  op(slot: string, player: string, level?: number) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/op`,
      { method: 'POST', body: { level } },
    );
  }
  deop(slot: string, player: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/deop`,
      { method: 'POST' },
    );
  }

  // ─── Whitelist ─────────────────────────────────────────────────────────
  whitelist(slot: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/whitelist`);
  }
  addWhitelist(slot: string, player: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/whitelist/${encodeURIComponent(player)}`,
      { method: 'PUT' },
    );
  }
  removeWhitelist(slot: string, player: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/whitelist/${encodeURIComponent(player)}`,
      { method: 'DELETE' },
    );
  }
  reloadWhitelist(slot: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/whitelist/reload`,
      { method: 'POST' },
    );
  }

  // ─── Banlist ───────────────────────────────────────────────────────────
  banlist(slot: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/banlist`);
  }
  ipBanlist(slot: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/banlist/ips`);
  }

  // ─── Properties ────────────────────────────────────────────────────────
  properties(slot: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/properties`);
  }
  patchProperties(slot: string, values: Record<string, string | number | boolean>) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/properties`, {
      method: 'PATCH',
      body: { values },
    });
  }

  // ─── Backups ───────────────────────────────────────────────────────────
  backups(slot: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/backups`);
  }
  createBackup(slot: string, body: { label?: string; stop_server?: boolean; include_logs?: boolean }) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/backups`, {
      method: 'POST', body, idempotent: true,
    });
  }
  getBackup(slot: string, id: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/backups/${encodeURIComponent(id)}`);
  }
  restoreBackup(slot: string, id: string) {
    return this.req(
      `/api/v1/slots/${encodeURIComponent(slot)}/server/backups/${encodeURIComponent(id)}/restore`,
      { method: 'POST', idempotent: true },
    );
  }
  deleteBackup(slot: string, id: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/backups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ─── Server update (Paper jar) ─────────────────────────────────────────
  serverUpdate(slot: string, mcVersion?: string) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/update`, {
      query: mcVersion ? { mc_version: mcVersion } : undefined,
    });
  }
  applyServerUpdate(slot: string, body: { mc_version: string; backup?: boolean }) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/update`, {
      method: 'POST', body, idempotent: true,
    });
  }

  // ─── System (per-instance) ─────────────────────────────────────────────
  systemTemperature() { return this.req('/api/v1/system/temperature'); }
  systemResources()   { return this.req('/api/v1/system/resources'); }

  // ─── Audit log ─────────────────────────────────────────────────────────
  audit(query?: { since?: string; until?: string; actor?: string; kind?: string; limit?: number; cursor?: string }) {
    return this.req('/api/v1/audit', { query });
  }

  // ─── Logs (HTTP tail) ──────────────────────────────────────────────────
  logs(slot: string, query?: { tail?: number; since?: string; level?: string[]; format?: 'parsed' | 'raw' }) {
    return this.req(`/api/v1/slots/${encodeURIComponent(slot)}/server/logs`, { query });
  }

  // ─── WebSocket URLs (caller opens the WS) ──────────────────────────────
  wsUrl(path: string): string {
    return `${this.baseUrl.replace(/^http/, 'ws')}${path}`;
  }
  slotEventsUrl(name: string): string {
    return this.wsUrl(`/api/v1/slots/${encodeURIComponent(name)}/events`);
  }
  logStreamUrl(name: string, query?: { tail?: number; since?: string; level?: string[] }): string {
    const url = new URL(this.wsUrl(`/api/v1/slots/${encodeURIComponent(name)}/server/logs/stream`));
    if (query?.tail) url.searchParams.set('tail', String(query.tail));
    if (query?.since) url.searchParams.set('since', query.since);
    if (query?.level) query.level.forEach((l) => url.searchParams.append('level', l));
    return url.toString();
  }

  /** Headers to use when opening a WS — bearer auth on subprotocol upgrade. */
  wsHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
