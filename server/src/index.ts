import { createServer } from 'node:http';
import './auth/types.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { disconnect } from './db.js';
import { buildApp } from './app.js';
import { applyBootstrap } from './mcsm/bootstrap.js';
import { startScannerLoop, stopScannerLoop } from './mcsm/scanner.js';
import { probeAll } from './mcsm/fleet.js';
import { attachWsProxy } from './mcsm/ws-proxy.js';

async function main(): Promise<void> {
  const { app, sessionParser } = buildApp();
  const server = createServer(app);

  attachWsProxy(server, { sessionParser });

  await applyBootstrap();
  startScannerLoop();
  // Probe peers periodically to populate lastSeenAt / lastError.
  const probeTimer = setInterval(() => { probeAll().catch(() => undefined); }, 60_000);
  probeTimer.unref?.();
  // Run one probe shortly after boot so the admin page isn't empty on first load.
  setTimeout(() => { probeAll().catch(() => undefined); }, 3_000).unref?.();

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'mcsw server listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutdown signalled');
    stopScannerLoop();
    clearInterval(probeTimer);
    server.close(() => {
      disconnect()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    // Hard-kill after 10s if connections won't drain.
    setTimeout(() => process.exit(1), 10_000).unref?.();
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
