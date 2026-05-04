# mcsw ↔ mcsm integration

Read [`mcsm-api.md`](./mcsm-api.md) for the wire contract. This file covers everything *mcsw-specific*: where bearer tokens live, browser-vs-proxy posture, federation strategy, and how to migrate off the legacy TCP+JSON protocol that the current codebase still speaks.

---

## 1. Posture: proxy through the mcsw backend

mcsw is an Express app with sessions and an account system. The MCSM bearer token must **never** leave the server.

```
Browser ──cookie session──► mcsw (Express) ──Bearer token──► mcsm
```

- The browser holds a normal mcsw session cookie (already present in the codebase: `usid`).
- mcsw's backend holds the MCSM tokens — one per configured peer — loaded from environment or `config/app.json`.
- All MCSM calls go through mcsw routes (e.g. `GET /api/proxy/discovery` → server-side fan-out to `GET /api/v1/federation/discovery` on a chosen MCSM).
- Browser never sees an MCSM URL or token. CORS on MCSM stays off.

If you ever want a thin browser-direct mode (e.g. an admin tool with no mcsw backend), use MCSM's CORS allowlist with credentialed requests and short-lived scoped tokens delivered via OAuth-style flow. **Don't ship that as the default.**

---

## 2. Configuration

Move from the current `MCSM_ENDPOINTS=host1:port1,host2:port2` (used in [src/Mcsm.js:7-10](../src/Mcsm.js#L7-L10)) to URL+token pairs:

```env
# .env
MCSM_PEERS_FILE=./config/mcsm-peers.json
```

```jsonc
// config/mcsm-peers.json — never commit
{
  "peers": [
    {
      "name": "node-a",
      "url": "https://mcsm-a.internal:8124",
      "token": "..."
    },
    {
      "name": "node-b",
      "url": "https://mcsm-b.internal:8124",
      "token": "..."
    }
  ],
  "primary": "node-a"   // default federation entry point
}
```

The token must have at minimum `discovery:read slot:read server:read peer:read`. For mcsw to actually drive servers (start/stop/say/kick) it needs `slot:write server:command server:moderate`. For full admin (op/whitelist/properties) it needs `server:admin`. A typical mcsw token is `*`.

`peers[].url` should be HTTPS — either MCSM's built-in TLS or behind a reverse proxy. mcsw's HTTP client must verify certs in production.

---

## 3. Fetching state — federation pattern

mcsw's screens almost always want a unified view across all MCSMs. Use **MCSM federation endpoints** rather than fanning out from mcsw:

| mcsw screen                  | Call                                                | Notes                                                     |
| ---------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Server browser / "what's available" | `GET {primary}/api/v1/federation/discovery`  | Single round-trip; sources include `ok` flag per peer.    |
| Slots dashboard              | `GET {primary}/api/v1/federation/slots`             | Each slot tagged with its `instance`.                     |
| Single server detail         | `GET {peer.url}/api/v1/slots/{name}`                | Address the owning instance directly using `instance` from federation response. |
| Live logs                    | `WS  {peer.url}/api/v1/slots/{name}/server/logs/stream` | Direct to owner. mcsw proxies the WS to the browser.      |

Federation endpoints are read-only by design. **Mutations always go to the owning instance directly.** Read `mounted_server.ownership.instance` (or `slots[].instance`) off the federation response, look it up in `peers[]`, and POST to that URL.

If `{primary}` is unreachable, fall back to the next peer in `peers[]`. Cache `federation/discovery` for ~5s to avoid hammering during rapid UI navigation; invalidate immediately after any mutation.

---

## 4. Replacing `lib/RestApi.js` and `src/Mcsm.js`

The current code talks to MCSM over a hand-rolled TCP+JSON protocol via [src/Mcsm.js:204-235](../src/Mcsm.js#L204-L235). That protocol is being **removed in MCSM v2**. Replace it with a thin HTTP client.

Recommended shape (filename suggestion: `lib/McsmClient.js`):

```js
class McsmClient {
  constructor({ url, token, fetch = globalThis.fetch }) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetch;
  }

  async request(method, path, { body, query, headers, idempotencyKey, signal } = {}) {
    const url = new URL(`${this.url}${path}`);
    if (query) for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
      else url.searchParams.set(k, v);
    }
    const res = await this.fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(json?.error?.message || `HTTP ${res.status}`);
      err.code = json?.error?.code;
      err.status = res.status;
      err.details = json?.error?.details;
      err.traceId = json?.error?.trace_id;
      throw err;
    }
    return json;
  }

  // Discovery & federation
  discovery(query)              { return this.request('GET',  '/api/v1/discovery', { query }); }
  federationDiscovery()         { return this.request('GET',  '/api/v1/federation/discovery'); }
  federationSlots()             { return this.request('GET',  '/api/v1/federation/slots'); }
  refreshDiscovery()            { return this.request('POST', '/api/v1/discovery/refresh'); }

  // Slots
  slots()                       { return this.request('GET',  '/api/v1/slots'); }
  slot(name)                    { return this.request('GET',  `/api/v1/slots/${encodeURIComponent(name)}`); }
  start(name, body)             { return this.request('POST', `/api/v1/slots/${encodeURIComponent(name)}/start`, { body, idempotencyKey: cryptoRandomId() }); }
  stop(name, body)              { return this.request('POST', `/api/v1/slots/${encodeURIComponent(name)}/stop`,  { body, idempotencyKey: cryptoRandomId() }); }
  restart(name, body)           { return this.request('POST', `/api/v1/slots/${encodeURIComponent(name)}/restart`, { body, idempotencyKey: cryptoRandomId() }); }

  // Mounted server
  command(slot, command)        { return this.request('POST', `/api/v1/slots/${encodeURIComponent(slot)}/server/command`, { body: { command } }); }
  say(slot, message)            { return this.request('POST', `/api/v1/slots/${encodeURIComponent(slot)}/server/say`,     { body: { message } }); }
  players(slot)                 { return this.request('GET',  `/api/v1/slots/${encodeURIComponent(slot)}/server/players`); }
  kick(slot, player, reason)    { return this.request('POST', `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/kick`, { body: { reason } }); }
  ban(slot, player, body)       { return this.request('POST', `/api/v1/slots/${encodeURIComponent(slot)}/server/players/${encodeURIComponent(player)}/ban`, { body }); }

  // Logs
  logs(slot, query)             { return this.request('GET',  `/api/v1/slots/${encodeURIComponent(slot)}/server/logs`, { query }); }

  // Peers
  peers()                       { return this.request('GET',  '/api/v1/peers'); }

  // Live streams (return raw WebSocket; caller wires up handlers)
  logStream(slot, { tail, since } = {}) {
    const url = new URL(`${this.url.replace(/^http/, 'ws')}/api/v1/slots/${encodeURIComponent(slot)}/server/logs/stream`);
    if (tail) url.searchParams.set('tail', tail);
    if (since) url.searchParams.set('since', since);
    return new WebSocket(url, { headers: { 'Authorization': `Bearer ${this.token}` } });
  }
  events(slot) {
    const url = `${this.url.replace(/^http/, 'ws')}/api/v1/slots/${encodeURIComponent(slot)}/events`;
    return new WebSocket(url, { headers: { 'Authorization': `Bearer ${this.token}` } });
  }
}
```

Then a fleet wrapper that picks the right client per instance:

```js
class McsmFleet {
  constructor(peers, primaryName) {
    this.clients = new Map(peers.map(p => [p.name, new McsmClient(p)]));
    this.primary = this.clients.get(primaryName) ?? this.clients.values().next().value;
  }
  client(instanceName) { return this.clients.get(instanceName); }
  async discovery()    { return this.primary.federationDiscovery(); }
  async slots()        { return this.primary.federationSlots(); }
}
```

mcsw routes call `fleet.client(instance).start(slot, { server_id })` — never address an instance by index or hand-built URL.

---

## 5. Things to delete

When the MCSM v2 client lands, these can go:

| File                                        | Why                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------- |
| [`src/Mcsm.js`](../src/Mcsm.js)             | Speaks the old TCP+JSON protocol; replaced by `lib/McsmClient.js`.  |
| [`lib/ScanNetwork.js`](../lib/ScanNetwork.js) | `evilscan`-based MCSM discovery; replaced by explicit `peers[]` config + MCSM federation. |
| `evilscan` dependency in `package.json`     | Same.                                                               |
| The `slot.uid = parseInt(\`${i}${data.id}\`)` index hack ([src/Mcsm.js:148](../src/Mcsm.js#L148)) | Replaced by stable `(instance, slot_name)` tuple. |

The `lib/RestApi.js` generic REST client can stay for non-MCSM services (Mojang API, etc.) but `McsmClient` should be its own thing — narrower, typed, and tightly coupled to the MCSM contract.

---

## 6. Auth model — mcsw users vs. MCSM tokens

These are independent layers:

- **mcsw users** (the `Users` model, sessions, bcrypt) — who is allowed to use the mcsw web app. Keep as-is.
- **MCSM tokens** — what mcsw is allowed to ask of MCSM. Server-side only, never per-user.

When an mcsw user takes a destructive action (stop a server, ban a player), mcsw decides *whether the user is permitted* using its own user/role system, then makes the call to MCSM with the mcsw service token. The MCSM audit log will attribute the action to `actor: { kind: "token", name: "mcsw" }`. To preserve the human actor, mcsw should **also** write its own audit row with `(mcsw_user, action, mcsm_instance, slot, server_id, mcsm_trace_id)` so the two logs can be joined later.

---

## 7. Secrets hygiene — action items

1. **Rotate the Discord bot token** committed in `mcsm/resources/server-default-config.json`. Once a token is in git history, treat it as compromised.
2. Move `config/mcsm-peers.json` and `.env` into `.gitignore` (verify they are).
3. MCSM token rotation: tokens in MCSM's `config.yaml` are argon2-hashed; rotation = generate a new token, deploy to mcsw, then remove the old hash from MCSM config.

---

## 8. Migration plan

Suggested order so mcsw stays runnable throughout the MCSM rewrite:

1. **Now** — write `lib/McsmClient.js` against the v1 spec, but don't wire it in. Land it with unit tests using `nock` or `msw-node`.
2. **MCSM Phase 1 ships** — the new MCSM exposes `/api/v1/instance`, `/discovery`, `/slots`, `/start`, `/stop`, `/command`, `/logs`. Add a `MCSM_VERSION=v2` env flag in mcsw that selects `McsmClient` over `src/Mcsm.js`. Run both side-by-side; default to old.
3. **MCSM Phase 2 ships** — federation, peer endpoints, audit log, metrics. mcsw switches `MCSM_VERSION=v2` as default; old code still loadable.
4. **MCSM Phase 3 ships** — Discord, backups, auto-update. Delete `src/Mcsm.js`, `lib/ScanNetwork.js`, drop `evilscan` from `package.json`.
