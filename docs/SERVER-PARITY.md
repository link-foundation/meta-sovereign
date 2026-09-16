# Server parity matrix — JS server vs. Rust server (languages: en • [zh](SERVER-PARITY.zh.md) • [hi](SERVER-PARITY.hi.md) • [ru](SERVER-PARITY.ru.md))

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
| `/api/email/pull`     | POST   | `js/src/server/routes-mutating.js` | `rust/crates/.../email.rs`    | Parity |
| `/api/email/send`     | POST   | `js/src/server/routes-mutating.js` | `rust/crates/.../email.rs`    | Parity |

The Rust server's `/api/email/*` routes match the JS wire shape for
archive ingest (`messages` / `value` / `list` / `emails` / `items`
envelopes resolve into `msg:email:*` links). Live Gmail / Microsoft
Graph / JMAP fetches and raw IMAP / POP3 / SMTP transport remain JS
server features because the Rust crate is `std`-only and ships no
outbound HTTP or TLS client; the Rust send route returns
`result.status: "needs-local-server"` when called for `imap` / `pop3` /
`smtp` so callers know to flip over to the JS backend.

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

## 5. CV synchronisation

| Route               | Method | JS server                    | Rust server | Status      |
| ------------------- | ------ | ---------------------------- | ----------- | ----------- |
| `/api/cv/platforms` | GET    | `js/src/server/routes-cv.js` | _missing_   | **JS only** |
| `/api/cv/plan`      | GET    | `js/src/server/routes-cv.js` | _missing_   | **JS only** |
| `/api/cv/stored`    | GET    | `js/src/server/routes-cv.js` | _missing_   | **JS only** |
| `/api/cv/read`      | POST   | `js/src/server/routes-cv.js` | _missing_   | **JS only** |
| `/api/cv/compare`   | POST   | `js/src/server/routes-cv.js` | _missing_   | **JS only** |
| `/api/cv/sync`      | POST   | `js/src/server/routes-cv.js` | _missing_   | **JS only** |
| `/api/cv/telemetry` | GET    | `js/src/server/routes-cv.js` | _missing_   | **JS only** |

These seven routes (R-V16) drive the CV screen described in
[`docs/CV-SYNC.md`](./CV-SYNC.md). They are JS only for a structural
reason rather than a scheduling one: `/api/cv/read` and `/api/cv/sync`
drive a real browser through `browser-commander` + Playwright, which is
a Node process. The Rust crate is `std`-only and cannot launch one.

The four routes that never touch a browser — `platforms`, `plan`,
`stored`, `compare` — are pure functions of the plan catalogue and the
store, so they are portable, and a Rust port is tracked in
`docs/ROADMAP.md`. Until then the SPA degrades the same way it does
for backups: the CV screen keeps its catalogue and diff views, and the
"read" and "sync" buttons explain that live runs need the JS server or
the `meta-sovereign cv-*` CLI.

## 6. Real-time transports

| Surface                   | JS server                | Rust server                    | Status |
| ------------------------- | ------------------------ | ------------------------------ | ------ |
| WebSocket sync (`/ws`)    | `js/src/server/index.js` | `rust/crates/.../ws.rs`        | Parity |
| WebRTC signaling (`/rtc`) | `js/src/server/index.js` | `rust/crates/.../signaling.rs` | Parity |

Both servers implement the same wire protocol: peers connect to `/ws`
for store-replication packets and to `/rtc` for the WebRTC
offer/answer/ICE rendezvous. `webrtc-sync.js` in the SPA does not need
to know which backend it is talking to.

## 7. Static asset serving

| Surface                                    | JS server                | Rust server                                      | Status |
| ------------------------------------------ | ------------------------ | ------------------------------------------------ | ------ |
| `/`, `/index.html`                         | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_static`        | Parity |
| `/<asset>.js`/`.css`/`.wasm`               | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_static`        | Parity |
| `/storage/`, `/handlers/`, `/sync/` mounts | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_browser_mount` | Parity |

Both servers refuse path traversal (`..`), only emit known MIME types,
and serve only flat single-file paths inside the browser mount
directories.

## 8. Summary

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read (links + derived + meta)  | 14     | 14     | 0       |
| Mutating CRUD                  | 15     | 15     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| CV synchronisation             | 7      | 0      | 7       |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **47** | **34** | **13**  |

The Rust server reaches **72 % route parity** today. The remaining
routes split into two groups: the "operator hardening" category
(R-K\*), which has JS-implemented fallbacks and is a porting backlog
item, and CV synchronisation (R-V\*), three of whose seven routes
cannot be ported at all while the Rust crate stays `std`-only, because
they drive a browser. For the typical end-user flow — open the SPA,
browse contacts, send messages, automate replies, sync between devices,
ingest email archives — the Rust server is a complete drop-in
replacement for the JS server.
