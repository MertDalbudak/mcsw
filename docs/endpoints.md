# MCSM endpoint reference (mcsw cheat sheet)

Every endpoint mcsm v2 exposes, in one place. Use this when wiring the
mcsw backend or building UI screens — the [full spec](./mcsm-api.md) has
all the conventions and prose; this file is the route × shape table.

**Status legend**

| Marker | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| ✅      | live in v2-rewrite (Phase 3 complete — backups, updates, Discord, OpenAPI, gameplay events) |
| 🚧      | not yet implemented — returns `501 not_implemented` envelope           |

Branch tip: <https://github.com/MertDalbudak/mcsm/tree/v2-rewrite>

---

## 1. Connection basics

```
Base URL:    http(s)://<host>:<port>/api/v1
Auth:        Authorization: Bearer <token>     (argon2id-hashed at rest)
Content:     application/json; charset=utf-8   (NDJSON for WS frames)
WebSocket:   ws(s)://<host>:<port>/api/v1/...  (Bearer header on Upgrade)
Trace id:    X-Request-Id header on every response (also in error envelope)
Rate limit:  RateLimit-Limit / -Remaining / -Reset headers on every response
```

Error envelope (every error, every endpoint):

```json
{ "error": { "code": "<stable>", "message": "<human>",
             "details": { ... }, "trace_id": "ab12cd34" } }
```

Slot state machine (returned by `/slots/{name}.state`):

```
idle → mounting → starting → running → stopping → idle
                                ↓                    ↑
                            crashed —————————————————┘
                                                        error (mount failed)
```

Ownership states (in `/discovery[].ownership.state`):

```
free | owned-self | owned-other | stale
```

---

## 2. Meta & health

| Method | Path             | Auth | Scope          | Status | Notes                                        |
| ------ | ---------------- | ---- | -------------- | ------ | -------------------------------------------- |
| GET    | `/healthz`       | no   | —              | ✅      | `{"status":"ok"}` — process up               |
| GET    | `/readyz`        | no   | —              | ✅      | 200 once boot complete; 503 `not_ready`      |
| GET    | `/version`       | no¹  | `instance:read`| ✅      | `{"version","commit","date"}`                |
| GET    | `/openapi.json`  | no¹  | `instance:read`| ✅      | OpenAPI 3.1 stub (full gen in Phase 3)       |

¹ Configurable via `api.public_meta` (default true → no auth).

---

## 3. Instance & discovery

### `GET /api/v1/instance` ✅ — `instance:read`

```json
{
  "name": "node-a",
  "version": "0.0.0-dev",
  "build": { "commit": "abc1234", "date": "2026-05-04T..." },
  "started_at": "2026-05-04T08:00:00Z",
  "uptime_seconds": 3600,
  "discovery_roots": ["/mnt/servers"],
  "slot_count": 2,
  "platform": { "os": "linux", "arch": "amd64", "java": "" }
}
```

### `GET /api/v1/discovery` ✅ — `discovery:read`

Query: `?state=free|owned-self|owned-other|stale` (repeatable),
`?type=paper|vanilla|fabric|forge` (repeatable).

```json
{
  "scanned_at": "2026-05-04T...",
  "servers": [{
    "id": "01900000-...", "name": "Survival",
    "type": "paper", "version": "", "path": "/mnt/servers/survival",
    "discovered_root": "/mnt/servers", "level_name": "world", "icon_b64": null,
    "ownership": { "state": "free" }
  }]
}
```

When `ownership.state != "free"`:

```json
"ownership": {
  "state": "owned-self|owned-other|stale",
  "instance": "node-b", "slot": "creative",
  "host": "10.0.0.21", "pid": 4711,
  "since": "2026-05-04T...", "heartbeat": "2026-05-04T..."
}
```

### `POST /api/v1/discovery/refresh` ✅ — `discovery:write`

No body. Returns the same shape as `GET /discovery`.

### `DELETE /api/v1/discovery/{server_id}/lock` ✅ — `discovery:write`

Query: `?force=true` (steal stale lock).

| Status | Code             | When                                    |
| ------ | ---------------- | --------------------------------------- |
| 200    | —                | released (or noop if already free)      |
| 404    | `server_not_found` | id not in discovery                  |
| 409    | `lock_held`      | owned-other, fresh; or stale w/o force  |

---

## 4. Slots

### `GET /api/v1/slots` ✅ — `slot:read`

```json
{ "slots": [ { "name":"creative", "port":25565, "public_address":"mc.example.com",
               "state":"running", "state_since":"...", "mounted_server_id":"01900000-...",
               "auto_mount": null, "last_error": null } ] }
```

### `GET /api/v1/slots/{name}` ✅ — `slot:read`

Same as list but with full `mounted_server` block when state is starting/running/stopping:

```json
{
  "name": "creative", "port": 25565, "state": "running", "state_since": "...",
  "mounted_server": {
    "id": "01900000-...", "name": "Survival", "type": "paper",
    "version": "", "path": "/mnt/servers/survival",
    "pid": 4711, "started_at": "...", "rcon_connected": true,
    "slp": {
      "online": true,
      "players": { "online": 3, "max": 20 },
      "motd": "A Minecraft Server", "latency_ms": 4,
      "sampled_at": "..."
    }
  },
  "last_error": null
}
```

### `GET /api/v1/slots/{name}/compatible-servers` ✅ — `slot:read`

```json
{ "slot": "creative", "scanned_at": "...",
  "servers": [ <subset of /discovery filtered by accepts.types,
                excluding owned-other> ] }
```

### `POST /api/v1/slots/{name}/start` ✅ — `slot:write`

Request: `{ "server_id": "01900000-...", "force": false }`
(`force=true` steals a stale lock).

| Status | Code                  | When                                            |
| ------ | --------------------- | ----------------------------------------------- |
| 202    | —                     | mount accepted; state → mounting                |
| 400    | `validation_failed`   | server_id missing                               |
| 400    | `server_incompatible` | doesn't satisfy accepts.types / max_memory_mb   |
| 404    | `slot_not_found` / `server_not_found` |                              |
| 409    | `slot_busy`           | slot not in idle/crashed/error                  |
| 409    | `server_in_use`       | another live instance owns it                   |

Response body: slot Snapshot (same shape as `GET /slots/{name}`).

### `POST /api/v1/slots/{name}/stop` ✅ — `slot:write`

Request (all optional):

```json
{ "graceful_seconds": 30, "broadcast_every": 10,
  "broadcast_template": "Server shutting down in {remaining}",
  "kill_grace": "10s" }
```

`202` with snapshot; observe via polling `/slots/{name}` or WS `/events`.

### `POST /api/v1/slots/{name}/restart` ✅ — `slot:write`

Same body as stop. Issues stop, waits for terminal state, then re-start
with the previously mounted server id.

### `POST /api/v1/slots/{name}/abort-stop` ✅ — `slot:write`

No body. Cancels in-progress grace timer; reverts state → running.
`409 not_stopping` if not in stopping state.

---

## 5. Mounted server — control

All require `slot.state == running` → `409 server_not_running` otherwise.

### `POST /api/v1/slots/{name}/server/command` ✅ — `server:command`

Request: `{ "command": "weather clear" }`
Response: `{ "command": "...", "response": "...", "elapsed_ms": 4 }`

### `POST /api/v1/slots/{name}/server/say` ✅ — `server:command`

Request: `{ "message": "..." }` → `{ "status": "sent" }`

### `GET /api/v1/slots/{name}/server/players` ✅ — `server:read`

```json
{ "online": 3, "max": 20,
  "players": [ { "name": "Steve" } ] }
```

### `POST /api/v1/slots/{name}/server/players/{player}/kick` ✅ — `server:moderate`

Request: `{ "reason": "AFK" }` (optional) → `{ "status":"kicked", "player":"Steve", "response":"..." }`
`404 player_not_online` when "No player was found" detected in RCON output.

### `POST /api/v1/slots/{name}/server/players/{player}/ban` ✅ — `server:moderate`

```json
{ "reason": "Griefing", "duration": "7d", "ban_ip": false }
```

`duration` optional (omitted = permanent). Vanilla doesn't natively
support timed bans — mcsm schedules an in-process unban; durable timed
bans land in Phase 3.

### `POST /api/v1/slots/{name}/server/players/{player}/unban` ✅ — `server:moderate`

No body. Issues `pardon` + `pardon-ip`.

### `POST /api/v1/slots/{name}/server/players/{player}/op` ✅ — `server:admin`

`{ "level": 4 }` (optional). Vanilla `/op` is binary; level is recorded
on the response but not enforced.

### `POST /api/v1/slots/{name}/server/players/{player}/deop` ✅ — `server:admin`

No body.

### Whitelist

| Method | Path                                                | Scope          | Status |
| ------ | --------------------------------------------------- | -------------- | ------ |
| GET    | `/api/v1/slots/{name}/server/whitelist`             | `server:read`  | ✅      |
| PUT    | `/api/v1/slots/{name}/server/whitelist/{player}`    | `server:admin` | ✅      |
| DELETE | `/api/v1/slots/{name}/server/whitelist/{player}`    | `server:admin` | ✅      |
| POST   | `/api/v1/slots/{name}/server/whitelist/reload`      | `server:admin` | ✅      |

GET response:

```json
{ "enabled": true, "players": [
    { "uuid": "00000000-...", "name": "Steve" } ] }
```

### Banlist

| Method | Path                                          | Scope         | Status |
| ------ | --------------------------------------------- | ------------- | ------ |
| GET    | `/api/v1/slots/{name}/server/banlist`         | `server:read` | ✅      |
| GET    | `/api/v1/slots/{name}/server/banlist/ips`     | `server:read` | ✅      |

```json
{ "players": [ { "uuid": "...", "name": "Bob",
                 "created": "...", "source": "Console",
                 "expires": "forever", "reason": "..." } ] }
```

### Properties

| Method | Path                                          | Scope          | Status |
| ------ | --------------------------------------------- | -------------- | ------ |
| GET    | `/api/v1/slots/{name}/server/properties`      | `server:read`  | ✅      |
| PATCH  | `/api/v1/slots/{name}/server/properties`      | `server:admin` | ✅      |

GET returns coerced types (bool/int/string):

```json
{ "values": { "motd": "Hello", "max-players": 20, "white-list": true,
              "view-distance": 10, "enable-rcon": true },
  "raw_path": "/mnt/servers/survival/server.properties" }
```

PATCH:

```jsonc
// Request
{ "values": { "motd": "Welcome!", "view-distance": 12, "server-port": 99999 } }
// Response
{ "applied": ["motd", "view-distance"],
  "requires_restart": ["motd", "view-distance"],
  "rejected": ["server-port"] }
```

mcsm-managed keys are always in `rejected`: `server-port`, `query.port`,
`enable-rcon`, `rcon.port`, `rcon.password`, `broadcast-rcon-to-ops`.

---

## 6. Logs

### `GET /api/v1/slots/{name}/server/logs` ✅ — `server:read`

Query: `?tail=N` (default 200, max 5000), `?since=<RFC3339>` (mutually
exclusive with tail), `?level=info|warn|error` (repeatable).

```json
{ "entries": [
    { "ts": "2026-05-04T...", "thread": "Server thread", "level": "INFO",
      "source": null, "message": "Steve joined the game",
      "raw": "[12:00:01] [Server thread/INFO]: Steve joined the game" } ],
  "truncated": false }
```

Lines that don't match the MC log header fall through with empty
thread/level and the full text as `message` + `raw`.

### `WS /api/v1/slots/{name}/server/logs/stream` ✅ — `server:read`

Connect with `Authorization: Bearer ...` header on the Upgrade.

Query at connect: `?tail=N` (initial backfill), `?since=<RFC3339>` (resume from cursor).

Frames (server → client, NDJSON, one LogEntry per text frame):

```json
{ "ts": "2026-05-04T...", "thread": "Server thread", "level": "INFO",
  "source": null, "message": "...", "raw": "..." }
```

Reconnect: pass `?since=<last-entry.ts>` to resume without gaps.

Client → server frames (optional):

```json
{ "type": "ping" }                             // server replies pong
{ "type": "filter", "level": ["warn","error"] } // accepted, not yet enforced
```

Server sends WS Ping frames every 30s for keepalive (handled by lib).

### `WS /api/v1/slots/{name}/events` ✅ — `slot:read`

Slot lifecycle + gameplay event stream. Frames per type:

```json
{ "type": "state",        "from": "starting", "to": "running", "at": "..." }
{ "type": "player_join",  "player": "Steve",                   "at": "..." }
{ "type": "player_leave", "player": "Steve",                   "at": "..." }
{ "type": "player_death", "player": "Steve", "killer": "Zombie",
                          "cause": "mob",
                          "message": "Steve was slain by Zombie","at": "..." }
{ "type": "player_kick",  "player": "Steve", "reason": "flying", "at": "..." }
{ "type": "chat",         "player": "Steve", "message": "hello","at": "..." }
{ "type": "tps_sample",   "tps_1m": 19.7, "tps_5m": 19.9,      "at": "..." }
{ "type": "error",        "code": "rcon_disconnected",
                          "message": "...",                    "at": "..." }
```

`tps_sample` is reserved for Phase 3 (Paper-only `/tps` polling); not
emitted yet.

---

## 7. System

### `GET /api/v1/system/temperature` ✅ — `system:read`

```json
{ "celsius": 62.4, "sensor": "/sys/class/thermal/thermal_zone0/temp",
  "sampled_at": "2026-05-04T...",
  "history": [ { "at": "...", "celsius": 60.1 } ] }
```

503 if `system.temperature.sensor` not configured.

### `GET /api/v1/system/resources` ✅ — `system:read`

```json
{ "cpu":  { "cores": 8, "used_pct": 23.4 },
  "mem":  { "total_bytes": 16777216000, "used_bytes": 8388608000, "used_pct": 50.0 },
  "load": { "1m": 0.5, "5m": 0.4, "15m": 0.3 },
  "disk": [ { "mount": "/var/lib/mcsm",
              "total_bytes": 5e10, "used_bytes": 2e10, "used_pct": 40.0 } ] }
```

Linux is fully populated; non-Linux returns just `cpu.cores`.

---

## 8. Audit

### `GET /api/v1/audit` ✅ — `audit:read`

Query: `?since=<RFC3339>`, `?until=<RFC3339>`, `?actor=<token-name>`,
`?kind=<route-classifier>`, `?limit=<1..1000>` (default 200), `?cursor=<id>`.

```json
{ "entries": [
    { "id": 9123, "at": "2026-05-04T...",
      "actor": { "kind": "token", "name": "mcsw" },
      "kind": "slot.start",
      "subject": { "slot": "creative", "server_id": "01900000-..." },
      "result": "ok", "status": 202, "trace_id": "ab12..." } ],
  "next_cursor": "9123" }
```

`kind` examples: `discovery.refresh`, `discovery.unlock`, `slot.start`,
`slot.stop`, `slot.restart`, `slot.abort-stop`, `server.command`,
`server.say`, `server.players.<name>.kick`, `server.players.<name>.ban`,
`server.whitelist.<name>`, `peers.refresh`.

Read endpoints are not audited (volume + no state change).

503 if `audit.enabled: false`.

---

## 9. Peers & federation

### `GET /api/v1/peers` ✅ — `peer:read`

```json
{ "peers": [
    { "name": "node-b", "url": "https://node-b.internal:8124",
      "reachable": true,
      "last_seen": "2026-05-04T...", "last_attempt": "...",
      "rtt_ms": 12, "remote_version": "0.0.0-dev", "remote_name": "node-b" },
    { "name": "node-c", "url": "...",
      "reachable": false, "last_attempt": "...",
      "last_error": "dial tcp: i/o timeout" }
  ] }
```

Empty `peers: []` if none configured.

### `POST /api/v1/peers/refresh` ✅ — `peer:read`

No body. Pings every peer in parallel; returns same shape as GET.

### `GET /api/v1/federation/discovery` ✅ — `discovery:read` + `peer:read`

Aggregates `/discovery` from self + every reachable peer; deduplicates
by `server.id`; on ownership conflict (two instances both claim a server)
the freshest heartbeat wins:

```json
{
  "scanned_at": "2026-05-04T...",
  "sources": [
    { "instance": "node-a", "self": true,  "ok": true  },
    { "instance": "node-b", "self": false, "ok": true,  "rtt_ms": 12 },
    { "instance": "node-c", "self": false, "ok": false, "error": "..." }
  ],
  "servers": [ { /* discovery.Server */ } ]
}
```

### `GET /api/v1/federation/slots` ✅ — `slot:read` + `peer:read`

Self + each peer's slots, every entry tagged with its `instance`:

```json
{
  "sources": [ ... same shape as above ... ],
  "slots": [
    { "instance": "node-a", "name": "creative", "port": 25565,
      "state": "running", "state_since": "...",
      "mounted_server_id": "01900000-..." },
    { "instance": "node-b", "name": "creative", ... }
  ]
}
```

> **Federation endpoints are read-only.** To mutate a slot/server on
> peer X, take the `instance` field off the federation response, look
> up the URL in `peers[]`, and address that URL directly.

---

## 10. Backups ✅

| Method | Path                                                          | Scope          |
| ------ | ------------------------------------------------------------- | -------------- |
| GET    | `/api/v1/slots/{name}/server/backups`                         | `server:admin` |
| POST   | `/api/v1/slots/{name}/server/backups`                         | `server:admin` |
| GET    | `/api/v1/slots/{name}/server/backups/{id}`                    | `server:admin` |
| POST   | `/api/v1/slots/{name}/server/backups/{id}/restore`            | `server:admin` |
| DELETE | `/api/v1/slots/{name}/server/backups/{id}`                    | `server:admin` |

POST body: `{ "label": "...", "stop_server": true|false, "include_logs": false }`.
Online mode (default) does RCON `save-off` → `save-all flush` → copy → `save-on`.
Offline (`stop_server: true`) requires the slot to be idle first; refuse otherwise.

Restore requires the slot to be **stopped** — refuses with `409 slot_busy` if running.
Excluded from archive: `.mcsm/owner.json`, `*.hprof`/`*.jfr`/`core.*`, `cache/`, and `logs/` unless `include_logs: true`.

---

## 10b. Updates ✅

| Method | Path                                              | Scope          |
| ------ | ------------------------------------------------- | -------------- |
| GET    | `/api/v1/slots/{name}/server/update?mc_version=…` | `server:admin` |
| POST   | `/api/v1/slots/{name}/server/update`              | `server:admin` |

GET response (PaperMC v2 API, server resolved from per-server config):

```json
{ "flavor": "paper", "mc_version": "1.21.4", "build": 50,
  "download_url": "https://api.papermc.io/.../paper-1.21.4-50.jar",
  "sha256": "...", "jar_name": "paper-1.21.4-50.jar",
  "published_at": "2026-04-30T..." }
```

POST body: `{ "mc_version": "1.21.4", "backup": true }`. Slot must be stopped.
On success the previous jar is preserved as `paper.jar.previous`.
Currently `flavor=paper` only; other flavors return `400 validation_failed`.

---

## 11. Metrics

### `GET /metrics` ✅

Prometheus exposition format, no auth by default (toggle via
`metrics.require_auth: true` → scope `metrics:read`).

Series exported:

```
mcsm_instance_info{name,version}                                gauge (always 1)
mcsm_slot_state{slot,state}                                     gauge
mcsm_slot_uptime_seconds{slot}                                  gauge
mcsm_server_players_online{slot,server_id}                      gauge
mcsm_server_players_max{slot,server_id}                         gauge
mcsm_server_restart_total{slot,reason}                          counter
mcsm_rcon_command_total{slot}                                   counter
mcsm_lock_steal_total{server_id}                                counter
mcsm_system_temperature_celsius{sensor}                         gauge
mcsm_api_request_total{route,method,status}                     counter
mcsm_peer_reachable{peer_name}                                  gauge (1/0)
mcsm_peer_rtt_seconds{peer_name}                                gauge
mcsm_audit_entries_total{kind,result}                           counter
```

---

## 12. Scopes

| Scope             | Grants                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| `*`               | everything                                                                          |
| `instance:read`   | `/instance`, `/version`                                                             |
| `discovery:read`  | `GET /discovery`, `GET /slots/{n}/compatible-servers`, federation/discovery (+peer) |
| `discovery:write` | refresh, unlock                                                                     |
| `slot:read`       | all `GET /slots/...`, WS `/events`, federation/slots (+peer)                        |
| `slot:write`      | start, stop, restart, abort-stop                                                    |
| `server:read`     | players, properties, banlist, whitelist (read), logs, log stream                    |
| `server:command`  | command, say                                                                        |
| `server:moderate` | kick, ban, unban                                                                    |
| `server:admin`    | op, deop, whitelist mutations, properties PATCH, backups                            |
| `system:read`     | `/system/*`                                                                         |
| `audit:read`      | `/audit`                                                                            |
| `metrics:read`    | `/metrics` when `require_auth: true`                                                |
| `peer:read`       | `/peers`, `/peers/refresh`, federation endpoints                                    |

A typical mcsw token gets `*`. A peer token gets:
`instance:read discovery:read slot:read server:read peer:read`.

---

## 13. Error catalog (HTTP → `code`)

| HTTP | code                     |
| ---- | ------------------------ |
| 400  | `bad_request`            |
| 400  | `validation_failed`      |
| 400  | `server_incompatible`    |
| 401  | `missing_token`          |
| 401  | `invalid_token`          |
| 403  | `scope_denied`           |
| 404  | `not_found`              |
| 404  | `slot_not_found`         |
| 404  | `server_not_found`       |
| 404  | `player_not_online`      |
| 404  | `backup_not_found`       |
| 404  | `peer_not_found`         |
| 409  | `slot_busy`              |
| 409  | `server_not_running`     |
| 409  | `server_in_use`          |
| 409  | `lock_held`              |
| 409  | `not_stopping`           |
| 409  | `peer_conflict`          |
| 423  | `instance_locked`        |
| 429  | `rate_limited`           |
| 500  | `internal`               |
| 501  | `not_implemented`        |
| 502  | `rcon_unreachable`       |
| 502  | `peer_unreachable`       |
| 503  | `not_ready`              |
| 504  | `command_timeout`        |

Every error carries a `trace_id` that matches the `X-Request-Id` response
header and the corresponding mcsm structured-log line.

---

## 14. Quick checklist for mcsw

- [ ] HTTP client with `Authorization: Bearer <token>` (server-side; never to browser)
- [ ] Idempotency-Key header on `start` / `stop` / `restart` (any opaque ≤128 chars)
- [ ] Honor `Retry-After` on 429
- [ ] WS clients send Bearer header on Upgrade; wire ping-frame handler
- [ ] Cache `/federation/discovery` for ~5s; invalidate on every mutation
- [ ] Read `mounted_server.ownership.instance` (or `slots[].instance` from federation) and route mutations to that peer's URL directly
- [ ] On 4xx, surface `error.message` to the user; include `error.trace_id` in your bug-report links
- [ ] Stream logs and slot events over WS rather than polling
