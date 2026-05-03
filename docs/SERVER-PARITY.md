# Server parity matrix — JS server vs. Rust server

This page enumerates every HTTP route and transport surface exposed by
both the JavaScript server (`src/server/index.js` + `routes-*.js`) and
the pure-Rust server (`crates/meta-sovereign-server/src/routes.rs` +
`handlers.rs`), so users can pick either backend with full knowledge
of feature parity.

The Rust server is the **preferred** local backend (single binary, no
runtime, fastest cold start). The JS server is the **fallback** (more
features today; works wherever Bun/Node/Deno work).

| Status        | Meaning                                                           |
| ------------- | ----------------------------------------------------------------- |
| **Parity**    | Both servers ship the route with identical request/response wire. |
| **JS only**   | Implemented in JS server, not yet ported to Rust.                 |
| **Rust only** | Implemented in Rust server, not present in JS.                    |

## 1. Read routes — links

| Route        | Method | JS server                      | Rust server             | Status |
| ------------ | ------ | ------------------------------ | ----------------------- | ------ |
| `/links`     | GET    | `routes-mutating.js:82`        | `handlers.rs:72`        | Parity |
| `/links/:id` | GET    | `routes-mutating.js:88`        | `handlers.rs:84`        | Parity |
| `/links`     | PUT    | `routes-mutating.js:85`        | `handlers.rs:76`        | Parity |
| `/links/:id` | DELETE | `routes-mutating.js:88` (soft) | `handlers.rs:84` (soft) | Parity |

`?include=tombstones` (or `?showDeleted=1`) and `?purge=1&confirm=1`
behave identically on both servers (R-K1, R-K2, R-K3).

## 2. Derived read routes

| Route               | Method | JS server              | Rust server                        | Status |
| ------------------- | ------ | ---------------------- | ---------------------------------- | ------ |
| `/api/contacts`     | GET    | `routes-derived.js:65` | `handlers.rs:425`                  | Parity |
| `/api/status`       | GET    | `routes-derived.js:66` | `handlers.rs:426`                  | Parity |
| `/api/autocomplete` | GET    | `routes-derived.js:68` | `handlers.rs:427`                  | Parity |
| `/api/audience`     | GET    | `routes-derived.js:75` | `handlers.rs:428`                  | Parity |
| `/api/facts`        | GET    | `routes-derived.js:79` | `handlers.rs:429`                  | Parity |
| `/api/search`       | GET    | `routes-derived.js:80` | `handlers.rs:430`                  | Parity |
| `/api/health`       | GET    | `routes-derived.js:88` | `handlers.rs:431`                  | Parity |
| `/sources`          | GET    | `index.js`             | `handlers.rs::sources`             | Parity |
| `/metrics`          | GET    | `metrics.js:9`         | `handlers.rs:717` (`metrics_text`) | Parity |

## 3. Mutating CRUD routes

| Route                 | Method | JS server                | Rust server       | Status |
| --------------------- | ------ | ------------------------ | ----------------- | ------ |
| `/api/patterns`       | GET    | `routes-mutating.js:187` | `handlers.rs:583` | Parity |
| `/api/patterns`       | PUT    | `routes-mutating.js:190` | `handlers.rs:584` | Parity |
| `/api/patterns/infer` | POST   | `routes-mutating.js:193` | `handlers.rs:585` | Parity |
| `/api/graphs`         | GET    | `routes-mutating.js:211` | `handlers.rs:586` | Parity |
| `/api/graphs`         | PUT    | `routes-mutating.js:214` | `handlers.rs:587` | Parity |
| `/api/graphs/run`     | POST   | `routes-mutating.js:217` | `handlers.rs:588` | Parity |
| `/api/replies`        | GET    | `routes-mutating.js:236` | `handlers.rs:589` | Parity |
| `/api/replies`        | PUT    | `routes-mutating.js:239` | `handlers.rs:590` | Parity |
| `/api/profile`        | GET    | `routes-mutating.js:246` | `handlers.rs:591` | Parity |
| `/api/profile`        | PUT    | `routes-mutating.js:253` | `handlers.rs:604` | Parity |
| `/api/resume`         | GET    | `routes-mutating.js:272` | `handlers.rs:631` | Parity |
| `/api/resume`         | PUT    | `routes-mutating.js:278` | `handlers.rs:641` | Parity |
| `/api/broadcast`      | POST   | `routes-mutating.js:295` | `handlers.rs:668` | Parity |

## 4. Outreach, backups, hardening

| Route                         | Method | JS server                | Rust server | Status      |
| ----------------------------- | ------ | ------------------------ | ----------- | ----------- |
| `/api/outreach`               | POST   | `routes-mutating.js:315` | _missing_   | **JS only** |
| `/api/backups`                | GET    | `routes-backup.js:100`   | _missing_   | **JS only** |
| `/api/backups`                | POST   | `routes-backup.js:103`   | _missing_   | **JS only** |
| `/api/backups/restore`        | POST   | `routes-backup.js:106`   | _missing_   | **JS only** |
| `/api/export-encrypted`       | POST   | `routes-mutating.js:335` | _missing_   | **JS only** |
| `/api/links/purge-tombstones` | POST   | `routes-mutating.js:338` | _missing_   | **JS only** |

These five endpoints land in the JS server first because they wrap the
JS-side AES-256-GCM vault, the JS-side outreach planner, and the
JS-side backup scheduler (R-K13..R-K17). The wire formats are stable
and the Rust ports are tracked as follow-up work in
`docs/ROADMAP.md`. Until the Rust server ships them, the SPA falls
back gracefully:

- The "Backups" view and "Export encrypted" button hide themselves
  when the connected server returns `404` for `/api/backups`.
- `meta-sovereign export-encrypted` and `meta-sovereign
purge-tombstones` keep working against any backend because the CLI
  always uses the JS implementation locally — the operator does not
  need a server at all to run them.

## 5. Real-time transports

| Surface                   | JS server      | Rust server               | Status |
| ------------------------- | -------------- | ------------------------- | ------ |
| WebSocket sync (`/ws`)    | `index.js:258` | `crates/.../ws.rs`        | Parity |
| WebRTC signaling (`/rtc`) | `index.js:261` | `crates/.../signaling.rs` | Parity |

Both servers implement the same wire protocol: peers connect to `/ws`
for store-replication packets and to `/rtc` for the WebRTC
offer/answer/ICE rendezvous. `webrtc-sync.js` in the SPA does not need
to know which backend it is talking to.

## 6. Static asset serving

| Surface                                    | JS server  | Rust server                      | Status |
| ------------------------------------------ | ---------- | -------------------------------- | ------ |
| `/`, `/index.html`                         | `index.js` | `routes.rs::serve_static`        | Parity |
| `/<asset>.js`/`.css`/`.wasm`               | `index.js` | `routes.rs::serve_static`        | Parity |
| `/storage/`, `/handlers/`, `/sync/` mounts | `index.js` | `routes.rs::serve_browser_mount` | Parity |

Both servers refuse path traversal (`..`), only emit known MIME types,
and serve only flat single-file paths inside the browser mount
directories.

## 7. Summary

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read (links + derived + meta)  | 14     | 14     | 0       |
| Mutating CRUD                  | 13     | 13     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **38** | **32** | **6**   |

The Rust server reaches **84 % route parity** today; the remaining
routes are all in the "operator hardening" category (R-K\*) and have
JS-implemented fallbacks. For the typical end-user flow — open the
SPA, browse contacts, send messages, automate replies, sync between
devices — the Rust server is a complete drop-in replacement for the JS
server.
