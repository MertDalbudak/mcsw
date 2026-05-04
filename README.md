# mcsw

Web UI for [`mcsm`](../mcsm) — start, stop, observe, and moderate Minecraft
servers from a browser. Multi-instance, multi-slot, mobile-friendly.

```
Browser ──cookie session──► mcsw (Express)  ──Bearer token──► mcsm peer
              ▲                  │
              │                  ▼ (WS proxy)
              └──── live slot/log streams ───
```

## Stack

| Layer | Choice |
| ----- | ------ |
| Database | SQLite via Prisma 7 + better-sqlite3 driver adapter |
| Backend | Node 22+, Express 5, TypeScript, Pino, Zod |
| Sessions | DB-backed, double-submit CSRF, rate limiting |
| Frontend | Vue 3 + Vite + TypeScript + Pinia + Vue Router |
| Styling | Tailwind v4 + Headless UI + Heroicons |
| Wire to mcsm | mcsm v1 REST API + WebSocket proxy |

## Layout

```
mcsw/
├── package.json          # npm workspaces root
├── .env                  # gitignored, copy from .env.example
├── server/               # Express API + mcsm client + WS proxy
│   ├── prisma/           # schema + migrations
│   └── src/
│       ├── auth/         # session store, csrf, rate limit, passwords
│       ├── mcsm/         # client, fleet, scanner, ws-proxy, bootstrap
│       ├── routes/       # auth, me, invitations, slots, mcsm-instances, …
│       ├── grants/       # per-server permission checks
│       └── ...
├── web/                  # Vue 3 SPA
│   ├── src/
│   │   ├── api/          # typed fetch client + endpoint wrappers
│   │   ├── stores/       # Pinia (auth)
│   │   ├── pages/        # route components (incl. /admin)
│   │   ├── layouts/      # AppLayout (sidebar) + AuthLayout
│   │   └── components/   # Btn, Field, Alert, StateBadge, …
│   └── vite.config.ts    # /api proxied to :3002 in dev
└── docs/                 # mcsm-api.md, integration.md (read-only refs)
```

## Setup

```bash
# 1. Install everything (workspaces auto-handle server + web).
npm install

# 2. Configure environment.
cp .env.example .env
# Generate a session secret:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Paste into SESSION_SECRET in .env.

# 3. Initialize the database.
npm run prisma:migrate    # creates server/prisma/dev.db, runs migrations
npm run db:seed           # creates an initial admin user + invite code
```

The seed log prints the admin email/password and an invitation code you can
share. Override defaults with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

## Develop

```bash
npm run dev:server   # tsx watch on src/index.ts (Express on :3002)
npm run dev:web      # Vite dev server on :5173 (proxies /api → :3002)
```

Open [http://localhost:5173](http://localhost:5173). The first signup uses
the invitation code from `npm run db:seed`. The first user becomes admin
automatically.

## Build for production

```bash
npm run build        # builds server (tsc) + web (vite)
npm run start        # runs server/dist/index.js
                     # serves web/dist as static files for any non-/api route
```

Behind a reverse proxy (Caddy, Traefik, nginx) terminating TLS, set
`COOKIE_SECURE=true` in production.

## mcsm peers

Three ways to register an mcsm instance:

1. **Admin UI** — `/admin/mcsm` lets you add a peer manually with a name,
   base URL, and bearer token. Use this for external/remote peers.
2. **LAN scan** — runs every `MCSM_SCAN_INTERVAL_MS` (default 5 min) on
   ports listed in `MCSM_SCAN_PORTS`. Newly discovered peers land in the
   DB **disabled** with no token; admin enters a token to enable them.
3. **Bootstrap env** — `MCSM_BOOTSTRAP=name|url|token,name|url|token,...`
   upserts each entry on startup. Useful for ephemeral environments.

## Auth

- Email + password (bcrypt, ≥10-char passwords).
- Email verification flow (link expires in 24h).
- Password reset flow (link expires in 1h, invalidates active sessions).
- Per-user, per-mcsm-server **grants** with capabilities:
  `start | stop | restart | command | moderate | admin | invite`.
- One Mojang account linked per user.
- Audit log on every privileged action.

`mcsw` users are independent of MCSM tokens — the bearer token never
leaves the server, every browser action goes through an Express route
that re-checks the user's grants before forwarding to mcsm.

## Scripts reference

| Command | Effect |
| ------- | ------ |
| `npm run dev`         | Run server + web dev servers in parallel |
| `npm run dev:server`  | Server only (tsx watch) |
| `npm run dev:web`     | Web only (vite) |
| `npm run build`       | tsc server, vite build web |
| `npm run start`       | Run compiled server (serves web/dist) |
| `npm run typecheck`   | tsc --noEmit on both workspaces |
| `npm run prisma:migrate` | `prisma migrate dev` (creates dev.db) |
| `npm run prisma:deploy`  | `prisma migrate deploy` (production) |
| `npm run prisma:studio`  | Browse the DB with Prisma Studio |
| `npm run db:seed`     | Seed initial admin + invitation |
