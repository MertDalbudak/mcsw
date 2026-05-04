import express, { type Express } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, Errors } from './error.js';
import { PrismaSessionStore } from './auth/session-store.js';
import { csrfProtection } from './auth/csrf.js';
import { loadCurrentUser } from './auth/middleware.js';
import { writeRateLimit } from './auth/rate-limit.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { invitationsRouter } from './routes/invitations.js';
import { mcsmInstancesRouter } from './routes/mcsm-instances.js';
import { discoveryRouter } from './routes/discovery.js';
import { slotsRouter } from './routes/slots.js';
import { serverActionsRouter } from './routes/server-actions.js';
import { grantsRouter } from './routes/grants.js';
import { adminUsersRouter } from './routes/admin-users.js';
import { systemRouter } from './routes/system.js';
import { auditRouter } from './routes/audit.js';

export interface AppHandle {
  app: Express;
  sessionParser: ReturnType<typeof session>;
}

export function buildApp(): AppHandle {
  const app = express();

  app.disable('x-powered-by');
  // Trust the first proxy in front of us (most deployments). Required for
  // express-rate-limit and `secure` cookies to read the real client IP.
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      // Health/static noise filters out at the request log level.
      autoLogging: {
        ignore: (req: { url?: string }) => req.url === '/healthz' || req.url === '/readyz',
      },
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser(config.SESSION_SECRET));

  const sessionParser = session({
    name: 'mcsw.sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PrismaSessionStore(),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.COOKIE_SECURE,
      maxAge: config.SESSION_MAX_AGE_MS,
      path: '/',
    },
  });
  app.use(sessionParser);

  app.use(loadCurrentUser);

  // ─── Health ────────────────────────────────────────────────────────────
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/readyz', (_req, res) => {
    res.json({ ok: true });
  });

  // ─── API routes ────────────────────────────────────────────────────────
  // CSRF on every mutating API route. Reads stay open. The Vue app
  // fetches `/api/auth/csrf` on boot to prime the cookie + token.
  app.use('/api', writeRateLimit);
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    return csrfProtection(req, res, next);
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/invitations', invitationsRouter);
  app.use('/api/mcsm-instances', mcsmInstancesRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/slots', slotsRouter);
  // Mounted-server operations live under each slot URL; the sub-router
  // resolves the slot's currently-mounted server id and grant-checks.
  app.use('/api/slots/:instanceId/:slot/server', serverActionsRouter);
  app.use('/api/grants', grantsRouter);
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin/system', systemRouter);
  app.use('/api/admin/audit', auditRouter);

  app.use('/api', (_req, _res, next) => next(Errors.notFound('Route not found')));

  // ─── Static (production) ───────────────────────────────────────────────
  // In dev, the Vue dev server runs on :5173 and proxies /api back here.
  // In prod, we serve the built SPA from ../web/dist.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDist = resolve(__dirname, '../../web/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api|\/healthz|\/readyz).*/, (_req, res) => {
      res.sendFile(resolve(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return { app, sessionParser };
}
