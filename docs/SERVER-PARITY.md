# Server parity matrix — JS server vs. Rust server

This page enumerates every HTTP route and transport surface exposed by
both the JavaScript server (`js/src/server/index.js` + `routes-*.js`) and
the pure-Rust server (`rust/crates/meta-sovereign-server/src/routes.rs` +
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

| Route        | Method | JS server                                 | Rust server                          | Status |
| ------------ | ------ | ----------------------------------------- | ------------------------------------ | ------ |
| `/links`     | GET    | `js/src/server/routes-mutating.js`        | `rust/crates/.../handlers.rs`        | Parity |
| `/links/:id` | GET    | `js/src/server/routes-mutating.js`        | `rust/crates/.../handlers.rs`        | Parity |
| `/links`     | PUT    | `js/src/server/routes-mutating.js`        | `rust/crates/.../handlers.rs`        | Parity |
| `/links/:id` | DELETE | `js/src/server/routes-mutating.js` (soft) | `rust/crates/.../handlers.rs` (soft) | Parity |

`?include=tombstones` (or `?showDeleted=1`) and `?purge=1&confirm=1`
behave identically on both servers (R-K1, R-K2, R-K3).

## 2. Derived read routes

| Route               | Method | JS server                         | Rust server                                 | Status |
| ------------------- | ------ | --------------------------------- | ------------------------------------------- | ------ |
| `/api/contacts`     | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/api/status`       | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/api/autocomplete` | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/api/audience`     | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/api/facts`        | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/api/search`       | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/api/health`       | GET    | `js/src/server/routes-derived.js` | `rust/crates/.../handlers.rs`               | Parity |
| `/sources`          | GET    | `js/src/server/index.js`          | `rust/crates/.../handlers.rs::sources`      | Parity |
| `/metrics`          | GET    | `js/src/server/metrics.js`        | `rust/crates/.../handlers.rs::metrics_text` | Parity |

## 3. Mutating CRUD routes

| Route                 | Method | JS server                          | Rust server                   | Status |
| --------------------- | ------ | ---------------------------------- | ----------------------------- | ------ |
| `/api/patterns`       | GET    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/patterns`       | PUT    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/patterns/infer` | POST   | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/graphs`         | GET    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/graphs`         | PUT    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/graphs/run`     | POST   | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/replies`        | GET    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/replies`        | PUT    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/profile`        | GET    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/profile`        | PUT    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/resume`         | GET    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/resume`         | PUT    | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |
| `/api/broadcast`      | POST   | `js/src/server/routes-mutating.js` | `rust/crates/.../handlers.rs` | Parity |

## 4. Outreach, backups, hardening

| Route                         | Method | JS server                          | Rust server | Status      |
| ----------------------------- | ------ | ---------------------------------- | ----------- | ----------- |
| `/api/outreach`               | POST   | `js/src/server/routes-mutating.js` | _missing_   | **JS only** |
| `/api/backups`                | GET    | `js/src/server/routes-backup.js`   | _missing_   | **JS only** |
| `/api/backups`                | POST   | `js/src/server/routes-backup.js`   | _missing_   | **JS only** |
| `/api/backups/restore`        | POST   | `js/src/server/routes-backup.js`   | _missing_   | **JS only** |
| `/api/export-encrypted`       | POST   | `js/src/server/routes-mutating.js` | _missing_   | **JS only** |
| `/api/links/purge-tombstones` | POST   | `js/src/server/routes-mutating.js` | _missing_   | **JS only** |

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

| Surface                   | JS server                | Rust server                    | Status |
| ------------------------- | ------------------------ | ------------------------------ | ------ |
| WebSocket sync (`/ws`)    | `js/src/server/index.js` | `rust/crates/.../ws.rs`        | Parity |
| WebRTC signaling (`/rtc`) | `js/src/server/index.js` | `rust/crates/.../signaling.rs` | Parity |

Both servers implement the same wire protocol: peers connect to `/ws`
for store-replication packets and to `/rtc` for the WebRTC
offer/answer/ICE rendezvous. `webrtc-sync.js` in the SPA does not need
to know which backend it is talking to.

## 6. Static asset serving

| Surface                                    | JS server                | Rust server                                      | Status |
| ------------------------------------------ | ------------------------ | ------------------------------------------------ | ------ |
| `/`, `/index.html`                         | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_static`        | Parity |
| `/<asset>.js`/`.css`/`.wasm`               | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_static`        | Parity |
| `/storage/`, `/handlers/`, `/sync/` mounts | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_browser_mount` | Parity |

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
