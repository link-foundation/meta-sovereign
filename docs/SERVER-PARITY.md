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

### Browser auto-import

| Route                               | Method | JS server                             | Rust server | Status      |
| ----------------------------------- | ------ | ------------------------------------- | ----------- | ----------- |
| `/api/auto-import`                  | GET    | `js/src/server/routes-auto-import.js` | _missing_   | **JS only** |
| `/api/auto-import`                  | POST   | `js/src/server/routes-auto-import.js` | _missing_   | **JS only** |
| `/api/auto-import/jobs/:id`         | GET    | `js/src/server/routes-auto-import.js` | _missing_   | **JS only** |
| `/api/auto-import/jobs/:id/capture` | POST   | `js/src/server/routes-auto-import.js` | _missing_   | **JS only** |
| `/api/auto-import/jobs/:id/stop`    | POST   | `js/src/server/routes-auto-import.js` | _missing_   | **JS only** |

Auto-import drives a real browser through browser-commander, a Node
library, so it stays a JS server feature. Against the Rust server the
Connections panel shows that browser import needs the JS server, and
manual archive import keeps working.

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

## 5a. Automations, people, sending and suggestions

| Route                                           | Method           | JS server                             | Rust server | Status      |
| ----------------------------------------------- | ---------------- | ------------------------------------- | ----------- | ----------- |
| `/api/automations`                              | GET, PUT         | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/<id>`                         | DELETE           | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/presets`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/plan`                         | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/run`                          | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts`                       | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts/{send,form,mark,skip}` | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/history`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/send`                                     | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/typing`                                   | GET, POST        | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/client-log`                               | POST             | `js/src/server/routes-client-log.js`  | _missing_   | **JS only** |
| `/api/people/learned`                           | GET              | `js/src/server/routes-learned.js`     | _missing_   | **JS only** |
| `/api/telegram/unread-marks`                    | GET              | `js/src/server/routes-telegram.js`    | _missing_   | **JS only** |
| `/api/telegram/read-marks`                      | POST             | `js/src/server/routes-telegram.js`    | _missing_   | **JS only** |
| `/api/people`, `/api/people/xref`               | GET              | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences`, `/api/lists`                  | GET, PUT, DELETE | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences/resolve`                        | POST             | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/suggest`, `/api/suggest/stats`            | GET              | `js/src/server/routes-suggest.js`     | _missing_   | **JS only** |

These routes (issue #31 and PR #34, R-X6..R-X18) are thin wrappers over
`js/src/automation/`, `js/src/crm/people.js` and `js/src/replies/`.
The SPA asks the server first, because it holds every imported archive
and the adapters' credentials, and otherwise runs the same code over
the links the browser already holds (`js/src/web/automation-api.js`):
offline it still lists, edits and previews automations, keeps
safe-mode drafts in their chats, searches people, resolves audiences
and suggests replies. Only delivering a message needs the server; a
message typed in the chat composer without one is kept in the browser
until a server syncs it. The `automations` CLI command works without
any server.

**Writes to other services need a confirmation.** Every route that
sends, posts or changes something on another service — `/api/send`,
`/api/automations/run` (auto mode), `/api/automations/drafts/send`,
`/api/email/send`, `/api/github/post-comment`,
`/api/upwork/post-message`, `/api/peopleperhour/post-message`,
`/api/broadcast`, `/api/outreach` (`mode: "queue"`),
`/api/greetings/plan` (`run: "queue"`), `/api/cv/sync` (`dryRun: false`),
`/api/profile/sync` and `/api/resume/sync` — first answers
`428 Precondition Required` with `{ needsConfirmation, action, preview,
confirm: { token, expiresAt } }` and does nothing. The client shows the
preview and repeats the identical body with `confirmToken`; the token is
single-use, bound to that body, valid for five minutes, and the server
performs exactly the previewed plan (`js/src/server/confirmations.js`).
A CV dry run already carries the token for applying its plan. `PUT
/api/profile` and `PUT /api/resume` only save; storing or syncing a
`broadcast:*`, `outreach:*`, `profile:*` or `resume:*` link never sends
anything. `/ws` and `/rtc` refuse WebSocket upgrades from origins outside
the CORS allow-list. The Rust server has none of these routes, so the
SPA reports "server required" there.

## 6. Greetings

| Route                      | Method | JS server                           | Rust server | Status      |
| -------------------------- | ------ | ----------------------------------- | ----------- | ----------- |
| `/api/greetings/catalogue` | GET    | `js/src/server/routes-greetings.js` | _missing_   | **JS only** |
| `/api/greetings/selection` | GET    | `js/src/server/routes-greetings.js` | _missing_   | **JS only** |
| `/api/greetings/selection` | PUT    | `js/src/server/routes-greetings.js` | _missing_   | **JS only** |
| `/api/greetings/stickers`  | POST   | `js/src/server/routes-greetings.js` | _missing_   | **JS only** |
| `/api/greetings/plan`      | POST   | `js/src/server/routes-greetings.js` | _missing_   | **JS only** |
| `/api/greetings/file`      | GET    | `js/src/server/routes-greetings.js` | _missing_   | **JS only** |

These six routes (issue #35) drive the Greetings screen described in
[`docs/GREETINGS.md`](./GREETINGS.md). `catalogue`, `selection` and the
`plan` preview are pure functions of the catalogue and the store and
are portable; `stickers`, the queued `plan` and `file` call the VK,
Telegram, WhatsApp and Messenger APIs through the JS source adapters.
Without them the SPA keeps the built-in catalogue and the preview, and
sending falls back to the `meta-sovereign greetings-*` CLI.

Both servers send the same Content-Security-Policy, whose `img-src`
allows `https://vk.com` so VK sticker previews load straight from VK.
Telegram thumbnails are never linked directly: their download URL
embeds the bot token, so `/api/greetings/file` proxies them.

## 7. Real-time transports

| Surface                   | JS server                | Rust server                    | Status |
| ------------------------- | ------------------------ | ------------------------------ | ------ |
| WebSocket sync (`/ws`)    | `js/src/server/index.js` | `rust/crates/.../ws.rs`        | Parity |
| WebRTC signaling (`/rtc`) | `js/src/server/index.js` | `rust/crates/.../signaling.rs` | Parity |

Both servers implement the same wire protocol: peers connect to `/ws`
for store-replication packets and to `/rtc` for the WebRTC
offer/answer/ICE rendezvous. `webrtc-sync.js` in the SPA does not need
to know which backend it is talking to.

## 8. Static asset serving

| Surface                                    | JS server                | Rust server                                      | Status |
| ------------------------------------------ | ------------------------ | ------------------------------------------------ | ------ |
| `/`, `/index.html`                         | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_static`        | Parity |
| `/<asset>.js`/`.css`/`.wasm`               | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_static`        | Parity |
| `/storage/`, `/handlers/`, `/sync/` mounts | `js/src/server/index.js` | `rust/crates/.../routes.rs::serve_browser_mount` | Parity |

Both servers refuse path traversal (`..`), only emit known MIME types,
and serve only flat single-file paths inside the browser mount
directories.

## 9. Summary

| Category                         | Routes | Parity | JS only |
| -------------------------------- | ------ | ------ | ------- |
| Read (links + derived + meta)    | 14     | 14     | 0       |
| Mutating CRUD                    | 15     | 15     | 0       |
| Outreach / backups / hardening   | 6      | 0      | 6       |
| CV synchronisation               | 7      | 0      | 7       |
| Greetings                        | 6      | 0      | 6       |
| Automations, people, suggestions | 14     | 0      | 14      |
| Real-time transports             | 2      | 2      | 0       |
| Static asset serving             | 3      | 3      | 0       |
| **Total**                        | **67** | **34** | **33**  |

The Rust server reaches **51 % route parity** today. The remaining
routes split into four groups: the "operator hardening" category
(R-K\*), which has JS-implemented fallbacks and is a porting backlog
item, and CV synchronisation (R-V\*), three of whose seven routes
cannot be ported at all while the Rust crate stays `std`-only, because
they drive a browser, the greeting routes (issue #35), which wait
on a Rust port of the source adapters, and the automation, people and
suggestion routes (issue #31, section 5a), which wait on a Rust port of
the automation runner, the people directory and the reply graph. For the typical end-user flow —
open the SPA, browse contacts, send messages, automate replies, sync
between devices, ingest email archives — the Rust server is a complete
drop-in replacement for the JS server.
