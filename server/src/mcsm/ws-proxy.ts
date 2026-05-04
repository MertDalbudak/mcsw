import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../logger.js';
import { prisma } from '../db.js';
import { getClient } from './fleet.js';
import { hasGrant } from '../grants/check.js';
import type session from 'express-session';

interface ProxyDeps {
  sessionParser: ReturnType<typeof session>;
}

/**
 * mcsw proxies WebSocket traffic between the browser and an mcsm peer so
 * the bearer token never leaves the server. URL pattern:
 *
 *   /api/proxy/mcsm/:instanceId/slots/:slot/events
 *   /api/proxy/mcsm/:instanceId/slots/:slot/logs?tail=N
 *
 * Auth: the standard mcsw session cookie is required (parsed via the
 * shared sessionParser middleware), and the user must have a grant that
 * lets them observe the slot.
 */
export function attachWsProxy(httpServer: Server, deps: ProxyDeps): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/api/proxy/mcsm/')) return;

    // Run express-session against the upgrade request to populate req.session.
    deps.sessionParser(req as unknown as Parameters<typeof deps.sessionParser>[0], {} as unknown as Parameters<typeof deps.sessionParser>[1], async (err) => {
      if (err) return abortHandshake(socket, 500);
      const sess = (req as unknown as { session?: { userId?: string } }).session;
      if (!sess?.userId) return abortHandshake(socket, 401);

      const parsed = parseProxyUrl(req.url!);
      if (!parsed) return abortHandshake(socket, 404);

      const user = await prisma.user.findUnique({ where: { id: sess.userId } });
      if (!user || user.isDisabled) return abortHandshake(socket, 401);

      const client = await getClient(parsed.instanceId);
      if (!client) return abortHandshake(socket, 404);

      // Resolve which mcsm-server-id is mounted in the slot, then check
      // the user's grant against that server.
      const slotInfo = (await client.slot(parsed.slot).catch(() => null)) as
        | { mounted_server?: { id?: string } | null; mounted_server_id?: string | null }
        | null;
      const mountedId = slotInfo?.mounted_server?.id ?? slotInfo?.mounted_server_id ?? null;
      if (mountedId) {
        const grant = await hasGrant(user.id, parsed.instanceId, mountedId, 'observe');
        if (!grant && !user.isAdmin) return abortHandshake(socket, 403);
      } else if (!user.isAdmin) {
        return abortHandshake(socket, 403);
      }

      // Build the upstream WS URL.
      const upstreamUrl =
        parsed.kind === 'events'
          ? client.slotEventsUrl(parsed.slot)
          : client.logStreamUrl(parsed.slot, parsed.query);

      const upstream = new WebSocket(upstreamUrl, { headers: client.wsHeaders() });
      upstream.on('error', (err) => {
        logger.warn({ err, upstreamUrl }, 'mcsm ws upstream error');
        abortHandshake(socket, 502);
      });

      upstream.once('open', () => {
        wss.handleUpgrade(req, socket, head, (ws) => {
          pipe(ws, upstream);
        });
      });
    });
  });
}

interface ParsedUrl {
  instanceId: string;
  slot: string;
  kind: 'events' | 'logs';
  query?: { tail?: number; since?: string; level?: string[] };
}

function parseProxyUrl(rawUrl: string): ParsedUrl | null {
  const url = new URL(rawUrl, 'http://x');
  const m = url.pathname.match(
    /^\/api\/proxy\/mcsm\/([^/]+)\/slots\/([^/]+)\/(events|logs)$/,
  );
  if (!m) return null;
  const kind = m[3] as 'events' | 'logs';
  if (kind === 'events') return { instanceId: m[1]!, slot: m[2]!, kind };
  const tail = url.searchParams.get('tail');
  const since = url.searchParams.get('since') ?? undefined;
  const level = url.searchParams.getAll('level');
  return {
    instanceId: m[1]!,
    slot: m[2]!,
    kind,
    query: {
      tail: tail ? Number.parseInt(tail, 10) : undefined,
      since,
      level: level.length ? level : undefined,
    },
  };
}

function pipe(client: WebSocket, upstream: WebSocket): void {
  const closeBoth = (code = 1000, reason = ''): void => {
    if (client.readyState === WebSocket.OPEN) client.close(code, reason);
    if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason);
  };
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
  });
  upstream.on('close', (code, reason) => closeBoth(code, reason.toString()));
  client.on('close', (code, reason) => closeBoth(code, reason.toString()));
  upstream.on('error', () => closeBoth(1011, 'upstream error'));
  client.on('error', () => closeBoth(1011, 'client error'));
}

function abortHandshake(socket: Duplex, status: number): void {
  socket.write(`HTTP/1.1 ${status} ${statusText(status)}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function statusText(s: number): string {
  switch (s) {
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 500: return 'Internal Server Error';
    case 502: return 'Bad Gateway';
    default: return 'Error';
  }
}

// Suppress unused import warning when the file is lint-checked in isolation.
export type { IncomingMessage };
