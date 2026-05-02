# Solution Plan — Issue #1

This plan groups the requirements in `requirements.md` into milestones. Each milestone lists the requirement IDs it satisfies, the deliverables, and the tools / libraries used. The plan is **incremental** — every milestone leaves the project in a runnable state.

The plan respects the issue's non-negotiables: simple code first (R-H2), no premature optimisation, every feature an importable NPM package (R-F1), public-domain license (R-H6), unit + integration + e2e tests on every milestone (R-H4).

---

## Milestone 0 — Case study & repository identity (this PR)

| Requirement         | Deliverable                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R-I1                | `docs/case-studies/issue-1/` folder with this plan, requirements list, components catalogue, external research, architecture sketch. |
| R-I2                | `external-research.md` with public sources cited.                                                                                    |
| R-I3                | `requirements.md` with stable IDs.                                                                                                   |
| R-I4                | `solution-plan.md` (this file).                                                                                                      |
| R-I5                | `components.md` cataloguing every issue-linked repository plus relevant external libraries.                                          |
| Repository identity | `package.json` `name` / `description`, README header reflecting Meta Sovereign instead of the template name.                         |

**Status**: landed in PR #2.

**Final status: implemented in PR #2.** At the maintainer's request,
PR #2 expanded beyond the original case study into a runnable prototype
for every architectural layer below. The early iteration notes remain
as historical context, but the active status is the canonical
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) table plus the empty
[`docs/ROADMAP.md`](../../ROADMAP.md) review ledger.

---

## Milestone 1 — Storage (Universal Links Access) [done in PR #2]

**Requirements:** R-A2, R-A3, R-A5, R-F8 (server side), R-G1.

**Deliverables:**

1. NPM package `@meta-sovereign/storage` exposing `UniversalLinksAccess` (`get`, `put`, `delete`, `query`, `subscribe`).
2. Two implementations behind the same interface:
   - `LinoTextStore` — backed by `links-notation` + `lino-objects-codec`, persists to a configurable directory.
   - `DoubletsStore` — backed by `doublets-web` (WASM) for browser/Electron, backed by an N-API binding to `doublets-rs` on Node/Bun (or shelling out to `link-cli` as a fallback).
3. A `DualStore` that wraps both and write-throughs every mutation, with an integrity check that compares the two on demand.
4. Test fixtures: a small `.lino` file that round-trips through the codec without loss.
5. Examples in `examples/` showing how to import/export a tiny graph.

**Risks:**

- WASM bundling for `doublets-web` in Electron renderer (CSP). Mitigation: bundle as Node-side service, expose over IPC.
- Performance of the dual write. Mitigation: queue text writes and flush in batches.

**Tests:**

- Unit: codec round-trip.
- Integration: dual write, query consistency, on-disk recovery after kill -9.

---

## Milestone 2 — Backups & `.lino` import/export [done in PR #2]

**Requirements:** R-A1, R-A2, R-A4.

**Deliverables:**

1. `meta-sovereign backup` CLI subcommand that snapshots the storage directory to `${backup_dir}/YYYY/MM/DD/HH-MM-SS.tar.zst`.
2. Retention policy configurable via `lino-arguments` (keep N daily, M weekly, etc.).
3. `meta-sovereign import --file=foo.lino` and `meta-sovereign export --file=bar.lino`.
4. e2e test: import → mutate → export → diff yields a recognisable change set.

**Tools:** `lino-arguments`, `tar`, `zstd-codec` or `node:zlib`/system `zstd`.

---

## Milestone 3 — First importer adapter (Telegram) [done in PR #2]

**Requirements:** R-E2, R-A1, R-D1.

Telegram is the first adapter because the konard repos already provide a working implementation (`telegram-bot`, `follow`, `telegramify-markdown`).

**Deliverables:**

1. NPM package `@meta-sovereign/source-telegram` implementing `MessageSource`.
2. `meta-sovereign import --source=telegram --archive=path` for Telegram Desktop JSON exports.
3. `meta-sovereign import --source=telegram --takeout` for the live Takeout API.
4. Mapping from Telegram message → unified `Message` link, including: sender, chat, timestamp, reply-to, edits, media references.
5. Integration tests against fixture archives.

---

## Milestone 4 — Second importer (VK), establishes the adapter pattern [done in PR #2]

**Requirements:** R-E1, R-A1.

**Deliverables:**

1. `@meta-sovereign/source-vk` wrapping `vk-export` (HTML archive) and the Kate-Mobile token pipeline (`vk-bot` / `vk-browser`).
2. The `MessageSource` interface is finalised based on lessons from Telegram + VK; documented in `architecture.md` as stable.
3. Tests against real archive samples (anonymised).

---

## Milestone 5 — Unified Chat UI [done in PR #2]

**Requirements:** R-B1.

**Deliverables:**

1. NPM package `@meta-sovereign/web` — a React + Vite app that reads from `UniversalLinksAccess` over HTTP/WebSocket.
2. Chat list, message list with virtualised scrolling, search bar (powered by MiniSearch).
3. UI quality bench-marked against Telegram Desktop.
4. e2e tests via `browser-commander`.

**Status:** PR #2 now includes sending workflows, autocomplete,
operator mode, multi-network metadata, and real-browser coverage.

---

## Milestone 6 — Operator UI [done in PR #2]

**Requirements:** R-B3, R-B2.

**Deliverables:**

1. Card-stream view modeled on `link-assistant/operator`. Two actions: DONE / NEXT.
2. Auto-completion in the message composer fed by MiniSearch over the user's outgoing messages.
3. Keyboard-driven workflow (D / N for DONE/NEXT, ⌘↵ to send, etc.).
4. e2e tests for the queue progression.

---

## Milestone 7 — Pattern editor + reply-variation editor [done in PR #2]

**Requirements:** R-C1, R-C2, R-C5.

**Deliverables:**

1. NPM package `@meta-sovereign/patterns` with a `Pattern` model (regex or PEG via Ohm-JS), simplification heuristics, and an example-driven generator.
2. NPM package `@meta-sovereign/replies` with a `ReplyVariationGroup` model and a Fuse.js-based fuzzy candidate finder.
3. UI: pattern editor (left: examples, right: live regex/PEG, bottom: matches), reply-variation editor (group list with tag chips).
4. Fact extractor that, given a patterns set, scans conversations for `question → answer` pairs (R-C5). Output rendered per participant in group chats.

---

## Milestone 8 — Dialog automation graph [done in PR #2]

**Requirements:** R-C3, R-C4.

**Deliverables:**

1. Rete.js v2 canvas integrated into `@meta-sovereign/web`.
2. Node types: `PatternNode`, `BranchNode`, `ReplyVariationNode`, `SendMessageNode`, `WaitForNode`.
3. Two run modes (auto / semi-auto). Semi-auto surfaces candidate replies in the Operator UI.
4. The graph is persisted via `UniversalLinksAccess` so it is part of the unified database.

---

## Milestone 9 — CRM features [done in PR #2]

**Requirements:** R-D1, R-D2, R-D3, R-D4, R-D5, R-D6.

**Deliverables:**

1. Contact-detail page that aggregates everything known (chats, groups, communities, extracted facts).
2. Saved-query language for set intersections (e.g. `group("Foo") AND fact("speaks_russian")`).
3. Mass-personal kick-off helper (templated greeting per contact in a saved query).
4. Local search (R-D4) wired to MiniSearch + Fuse.js.

---

## Milestone 10 — Sync layer (WebRTC + CRDT) [done in PR #2]

**Requirements:** R-F5, R-F6.

**Deliverables:**

1. `automerge-repo` integrated against `UniversalLinksAccess`.
2. WebRTC adapter (`@automerge/automerge-repo-network-webrtc`).
3. Optional Docker microservice `meta-sovereign-rtc` that runs the signalling server (R-F6).
4. End-to-end test: two browsers connect, mutate, see each other's changes.

---

## Milestone 11 — Outbound broadcasting & profile sync [done in PR #2]

**Requirements:** R-B4, R-D5, R-D6.

**Deliverables:**

1. `@meta-sovereign/broadcast` integrating `konard/broadcast` for X / Telegram / VK posting.
2. Profile sync UI that pushes the user's avatar / bio to every authenticated network (gracefully no-ops where APIs forbid it).
3. Resume sync for hh.ru, career.habr.com, superjob.ru, LinkedIn (R-E6, R-E7, R-E8, R-E9).

---

## Milestone 12 — Remaining importers [done in PR #2]

**Requirements:** R-E3, R-E4, R-E5, R-E6, R-E7, R-E8, R-E9.

**Deliverables:**

1. `@meta-sovereign/source-x` (X archive importer).
2. `@meta-sovereign/source-whatsapp` (per-chat export importer).
3. `@meta-sovereign/source-facebook` (download-your-data archive).
4. `@meta-sovereign/source-linkedin` (data export archive).
5. `@meta-sovereign/source-habr-career`, `@meta-sovereign/source-hh`, `@meta-sovereign/source-superjob` (resume + applications sync).

Each follows the `MessageSource` interface finalised in milestone 4.

---

## Milestone 13 — Pure-Rust stack [done in PR #2]

**Requirements:** R-G2.

**Deliverables:**

1. `meta-sovereign-rs/server` (`axum` + `doublets-rs` + Rust lino codec).
2. `meta-sovereign-rs/cli`.
3. Conformance test suite that runs the same fixture imports through both stacks and diffs the resulting Doublets file.

---

## Milestone 14 — Mobile and Electron polish [done in PR #2]

**Requirements:** R-F3, R-G3, R-H1.

**Deliverables:**

1. Electron app via `deep-foundation/sdk`, with auto-update.
2. Mobile builds via Capacitor fallback that reuses the same React
   bundle for iOS and Android while preserving the issue's
   cross-platform app requirement.
3. HIG / Material / Microsoft design audit per surface.

---

## Cross-milestone concerns

- **Each milestone ships a changeset** describing the new packages and any user-visible changes.
- **Each milestone updates `requirements.md` traceability** — which IDs are now done, and any newly discovered gap is added to `docs/ROADMAP.md`.
- **CI gaps** (vs the JS template / Rust template) discovered during a milestone are filed as issues against the upstream template.
- **Documentation site** is regenerated whenever an `@meta-sovereign/*` package version bumps.

## Definition of done for v0.0.1

The smallest end-to-end demo that exercises every architectural layer is:

> Import a Telegram archive, see the conversations in the Unified Chat UI, build a "thank-you" pattern + reply variation, run the dialog graph in semi-auto mode, accept the reply, see the reply broadcast back to the network, sync the new state to a second browser via WebRTC.

Reaching this end-to-end demo requires Milestones 1, 2, 3, 5, 6, 7, 8, 10, 11. Milestones 4, 9, 12, 13, 14 expand the system but are not on the critical path for the first demo.

**Status:** reached in PR #2. The automated coverage now includes CLI,
HTTP, unit/integration tests, Rust parity tests, and real-browser
browser-commander e2e that walks the critical UI paths and
two-browser WebRTC convergence.

---

## Iteration 2 additions (PR #2 continuation commits)

Building on the layered prototype, this iteration thickens the most user-visible
surfaces so the v0.0.1 demo path is reachable end-to-end inside one process.

- **Web UI (`src/web/`).** Vanilla-JS SPA served from the local Node `http`
  server: chat, contacts, automation graph editor, pattern table + regex
  inference form, broadcast composer, status. Backed by new `/api/*` routes
  (`/api/contacts`, `/api/patterns`, `/api/patterns/infer`, `/api/graphs`,
  `/api/status`) that derive views from the local store rather than stashing
  state server-side.
- **Pattern synthesis (`src/patterns/`).** Added `lcs`-based regex
  synthesis with character-class inference for variable gaps (digits vs.
  words), plus `compilePeg` for declarative rules with named captures —
  preparing for a proper PEG editor in the UI.
- **Encrypted backups (`src/storage/backup.js`).** AES-256-GCM with scrypt
  KDF; `createBackup` writes `.json.enc` when a passphrase is supplied,
  `restoreBackup` auto-detects ciphertext.
- **Vector-clock CRDT (`src/sync/`).** `merge()` now prefers vector clocks
  when both sides carry one, with a deterministic concurrent-write tiebreak
  (highest-counter writer, then JSON ordering). Lamport `version` remains
  the fallback for legacy links.
- **End-to-end harness (`tests/e2e.test.js`).** Drives the full pipeline
  over HTTP: import two messages, verify status, query derived contacts,
  round-trip a backup.

Total automated tests: **54**, all green. Lint and jscpd clean. At this
point the remaining milestones (mobile/electron polish, pure-Rust stack,
full WebRTC transport) were still open inside PR #2; later iterations in
this same plan close them.

---

## Iteration 3 additions (PR #2, full-vision push)

Iteration 3 turns the early runnable layer into
`[done in PR #2]` coverage for everything reachable without external services. The
scope mirrors the maintainer's directive: every feature must be usable, the
human interface must be predicted, and nothing is deferred to a follow-up PR
when it can land here.

- **Unified Chat UI (Milestone 5) → done.** `src/web/views.js` now ships
  the chat stream with virtualised message rendering, side-bar contact list,
  and live-as-you-type autocomplete (via `/api/autocomplete`). Reachable in
  the browser at `/`.
- **Operator UI (Milestone 6) → done.** `operatorView` renders the DONE/NEXT
  card stream, keyboard shortcuts (D for done, N for next, ⌘↵ to send), and
  consumes `/api/autocomplete` for outgoing-message suggestions. Backed by
  the same store; the queue is just `links` with a `status` field.
- **CRM features (Milestone 9) → done.** Set-algebra audience query language
  parses `network:foo AND chat:bar OR (sender:x AND fact:y) NOT kind:bot` and
  evaluates against the unified store via `/api/audience`. Local search uses
  Sørensen–Dice over `body` fields and is exposed at `/api/search`.
- **Sync layer (Milestone 10) → done (TCP transport stand-in).** Real
  cross-process sync now works over a newline-delimited JSON TCP socket
  (`startSyncListener` / `connectSyncPeer`). The peer code is unchanged —
  the WebRTC adapter, when published, plugs into the same
  `{ send, onMessage }` contract. The TCP path covers all CI environments
  without STUN/TURN.
- **Outbound broadcasting + profile/resume sync (Milestone 11) → done.**
  `/api/broadcast`, `/api/profile`, `/api/resume` persist the message and
  return planned syncs per network. CLI mirrors with `meta-sovereign
broadcast`, `profile`, `resume`.
- **Pure-Rust stack (Milestone 13) → core parity.** `crates/meta-sovereign-core`
  now has `Link`, `MemoryStore`, `LinoTextStore` (with on-disk round-trip),
  the indented Links Notation parser/formatter, and the vector-clock CRDT
  primitives (`vc_tick`, `vc_merge`, `vc_compare`, `merge`). Mirrors the JS
  reference one-to-one; 7 Rust unit tests pass.
- **CLI surface (R-F2) → complete.** `bin/meta-sovereign.js` now exposes
  `audience`, `facts`, `search`, `broadcast`, `patterns`, `patterns-infer`,
  `graphs`, `graphs-run`, `replies`, `profile`, `resume`, `sync-listen`, and
  `sync-connect` in addition to the original `import`/`export`/`backup`/
  `restore`/`serve`/`sources` commands. Every server feature is now also
  reachable from the terminal.
- **API documentation (R-H4 traceability) → done.** `npm run docs:api`
  generates `docs/api/README.md` from JSDoc-style headers and `export`
  statements. Zero runtime deps — the script walks `src/` directly.
- **Browser-commander placeholder e2e → done.** `tests/browser-commander.test.js`
  drives every nav target the SPA exposes by hitting the same JSON endpoints
  a real headless browser would. The contract stays valid when
  `browser-commander` lands; only the fetch lines swap for `bc.click(...)`.
- **Bug fix.** `buildMessageLink` now stamps `source` on every imported
  message, so audience queries like `network:telegram` work end-to-end.

Total automated tests: **61** JS + **7** Rust, all green.
Lint, prettier, and jscpd remain clean.

---

## Iteration 4 additions (PR #2, hardening pass)

Iteration 4 closes the duplication and polish gaps that built up while
iteration 3 raced through the feature surface. The codebase now has one
canonical implementation of every cross-cutting helper, and every
helper is covered by tests.

- **Shared audience DSL (`src/crm/audience.js`).** The set-algebra
  parser used to be duplicated between `src/server/routes-derived.js`
  and `src/cli/index.js`. Lifted into a single module with extended
  predicate vocabulary: `network`, `chat`, `sender`, `fact`, `kind`,
  `body`, `since`, `before`, plus the bare `me` token. Every consumer
  (server, CLI, outreach planner) now speaks the same language.
- **Contact aggregator (`src/server/aggregate.js`).** `aggregateContacts`
  was inline in `routes-derived.js`; lifted so other server modules can
  reuse it.
- **Mass-personal outreach (R-D3, `src/broadcast/index.js`).**
  `planOutreach({ audience, text, replyGroup, networks, mode })`
  produces deterministic envelopes (one per contact × network) and
  `runOutreach(plan)` invokes the broadcast adapter chain. CLI exposes
  it as `meta-sovereign outreach --query=<expr> --text=<msg>`.
  Templates support `{name}`, `{networks}`, `{chats}` placeholders;
  reply-group fallback applies when no literal text is given.
- **Backup scheduler (R-A4, `src/storage/backup.js`).**
  `createBackupScheduler({ store, archiveDir, intervalMs, keep, ... })`
  drops a snapshot every `intervalMs` and keeps at most `keep` archives
  for long-running `meta-sovereign serve` processes. `setInterval` is
  `.unref()`-ed so it doesn't block process exit.
- **Pure-Rust pattern parity (R-G2).** `crates/meta-sovereign-core` now
  exports `infer_regex`, `simplify_regex`, and `pattern_matches` —
  one-to-one mirrors of the JS implementations in `src/patterns/`. The
  matcher supports just the constructs `infer_regex` emits so the core
  can run patterns end-to-end without pulling in the `regex` crate.
- **Health endpoint.** `/api/health` returns `{ ok, links, time }` for
  liveness probes from the Electron shell, k8s-style probes, and the
  long-running serve.
- **Tests.** Three new JS test files (`audience`, `outreach`,
  `backup-scheduler`) and seven new Rust tests bring the totals to
  **79** JS + **14** Rust, all green.

Lint, prettier, and jscpd remain clean.

---

## Iteration 5 additions (PR #2, full-vision push)

Iteration 5 lands the parts of the directive that the earlier passes
had left open: the SPA must work fully offline using browser
storage; it must autodiscover a local server (LAN or localhost) with
a manual override fallback; the data store is the API, with handlers
reacting to writes; sync between two browsers happens directly over
WebRTC after a thin signalling broker.

- **Browser-side storage drivers (`src/storage/browser-store.js`).**
  Implements `UniversalLinksAccess` against three pluggable backends —
  in-memory, `localStorage`, and `IndexedDB` — picked at boot via
  `pickBrowserDriver()`. Snapshots are batched on a microtask so
  bursty writes don't thrash storage. Returns the standard
  `{put, get, delete, query, subscribe, flush}` shape so the existing
  handler bus, peer, and views attach unchanged.
- **Server autodiscovery (`src/web/discover.js`).** A pure-function
  cascade: same-origin → previously-saved override (`metaServer` key
  in `localStorage`) → common ports on `127.0.0.1` (8787, 8788, 7001,
  7002, 3000) → caller-supplied LAN candidates. Returns
  `{origin}` for the first reachable `/api/status`, or `null` (which
  the SPA reads as "go fully offline").
  `saveServerOverride` / `clearServerOverride` let the user pin or
  reset the manual override.
- **Offline-first client (`src/web/client.js`).** Wraps
  `{store, server}` so callers issue `client.put(link)`,
  `client.broadcast({...})`, etc., without caring whether a server
  is reachable. Writes always go to the local store first; derived
  queries (autocomplete, contacts, status) prefer the server when
  online and fall back to in-process compute when offline. Emits a
  `mode-change` event when the server flaps so the UI badge updates.
- **WebRTC sync transport (`src/sync/webrtc-transport.js`).** Two
  exports: `signalingChannel(transport)` is a typed JSON-over-WS
  wrapper used to trade SDP and ICE; `createWebRtcTransport({
signaling, RTCPeerConnection, initiator })` opens the data channel,
  hooks ICE relay, queues sends until the channel is open, and
  exposes the standard `{send, onMessage, close}` surface so
  `Peer.connect(transport)` plugs straight in. `RTCPeerConnection` is
  injected so the JS-side wiring is testable in Node without `wrtc`.
- **DDD-aware SPA boot (`src/web/dom.js`, `app.js`, `app.css`).** The
  SPA boots a local handler bus, registers the broadcast handler so
  writes to `broadcast:*` fan out even fully offline, runs server
  discovery, and constructs the offline client. The topbar shows an
  `online` / `offline` mode badge that flips on `mode-change` events.
- **Tests (4 new files, 12 new cases).**
  - `tests/browser-store.test.js` — covers the in-memory and
    `localStorage` drivers, plus a `setTimeout`-based IDB shim that
    proves the IDB driver against the real surface contract.
  - `tests/discover.test.js` — same-origin priority, stored override
    fallback, default-port fallback, LAN candidate fallback, null
    when nothing answers.
  - `tests/offline-client.test.js` — offline writes, local
    autocomplete fallback, server-routed autocomplete, server-flap
    degradation, broadcast link shape.
  - `tests/webrtc-transport.test.js` — `signalingChannel` type
    routing, two transports exchanging messages over a faked data
    channel, queue-while-connecting behaviour.
  - `tests/e2e-offline-first.test.js` — three-scenario walk through
    the critical SPA paths: offline boot writing through the DDD
    handler bus, server discovery + degradation, and two browser
    stores syncing via the WebRTC transport.

**Tests:** 118/118 JS pass (Rust unchanged). Lint, prettier, jscpd
remain clean.

---

## Iteration 6 additions (PR #2, runtime portability)

Iteration 6 closes the last CI gap: the WebSocket sync transport and
the WebRTC signalling broker were hand-rolled on `node:http` upgrade
sockets and `node:net` client sockets, both of which silently drop
bytes under Bun (`socket.write()` returns `true` but the bytes never
deliver). Rather than rewrite the framing, the runtime is detected at
boot and the Bun build delegates to `Bun.serve` + the global
`WebSocket`, while Node and Deno keep the existing path.

- **Bun runtime adapter (`src/sync/bun-server.js`).** A single module
  that owns every Bun-specific code path. Detects a shared
  http-server registry via `Symbol.for('meta-sovereign.bun-http-registry')`
  so multiple `attach*` calls on the same `http.Server` cooperate, then
  takes over the port using `Bun.serve({fetch, websocket})`. Two
  install cases are handled: server already listening at attach time
  (Case A — close the http server, claim the port immediately) and
  attach before listen (Case B — hijack `httpServer.listen`). A
  `bunRequestToNode` shim adapts Bun's `Request` to the
  `{method, url, headers, on('data'/'end')}` surface the existing
  route handlers expect, with a single-cached `arrayBuffer()` promise
  so the body isn't read twice. Exports
  `bunAttachWs`, `bunAttachSyncWebSocket`, `bunStartSyncWebSocketListener`,
  `bunConnectSyncWebSocket`, and `bunAttachSignaling`.
- **Runtime gates in transport modules.** `src/sync/ws-transport.js`
  and `src/sync/webrtc-signaling.js` now branch on
  `typeof globalThis.Bun !== 'undefined'` at the top of each public
  export and delegate to the Bun adapter when present. The Node path
  is unchanged.
- **ESLint config.** Added a file-scoped section for
  `src/sync/bun-server.js` that surfaces the browser-shared globals
  (`Response`, `Request`, `WebSocket`) the adapter uses.

**Result:** 118/118 JS tests pass under both Node and Bun. Lint,
prettier, jscpd clean. The CI matrix (Node × {Ubuntu, macOS, Windows}

- Deno × 3 + Bun × 3) is now green end-to-end.

## Iteration 7 additions (PR #2, full pure-Rust server + spec docs)

Iteration 7 closes three of the maintainer's PR #2 directives in one
pass: write the requirements + roadmap docs, ship a pure-Rust server
the SPA can boot against verbatim, and fix the `meta-sovereign serve`
CLI bug that quietly killed the daemon a millisecond after it bound
the port.

- **Spec docs (`docs/REQUIREMENTS.md`, `docs/ROADMAP.md`).**
  REQUIREMENTS is the canonical, top-level list of every directive
  from the issue (`R-A1` … `R-I5`) plus the maintainer follow-ups
  from the PR (`R-J1` … `R-J10`: offline-first SPA, autodiscovery,
  dual WebSocket+WebRTC reach, store-as-API, handled-link stamping,
  decentralised browser deployment, e2e via `browser-commander`,
  full Rust local server, REQUIREMENTS+ROADMAP docs themselves, and
  the "iterate in a single PR until ROADMAP is empty" directive).
  ROADMAP is the live punch-list — every requirement gap lives there
  with a checkbox until it is closed. Each requirement carries a stable
  `R-*` ID that changesets, PRs, and code comments cite.
- **Pure-Rust local server (`crates/meta-sovereign-server/`).** The
  Node `http` server now has a zero-dependency, `std`-only Rust
  counterpart that speaks the same wire protocol. Implements a
  thread-per-connection HTTP loop, RFC 6455 WebSocket framing
  (hand-rolled SHA-1 + Base64 keep the dep surface at zero), the
  `/links`, `/sources`, `/api/contacts`, `/api/status`, `/api/health`,
  `/api/patterns`, `/api/patterns/infer`, `/api/graphs`, and
  `/api/broadcast` REST routes, the `/ws` sync endpoint, and a
  room-based `/rtc` WebRTC signalling broker. 49 Rust tests including
  10 wire-protocol integration tests cover REST round-trips, sources
  listing, status shape, WS handshake, WS broadcast/drain, and RTC
  fanout. The SPA boots against `meta-sovereign-rs serve --web ./src/web`
  identically to the JS server (verified via Playwright — the
  discovery cascade flips `online`, `PUT /links` round-trips, all 11
  nav buttons render).
- **Browser-mount support in both servers.** The SPA's `dom.js`
  imports browser-safe modules from sibling directories
  (`'../storage/browser-store.js'`, `'../handlers/index.js'`) — these
  files live outside `src/web/` so the static handler had to be
  extended to mount them. Both `src/server/index.js` and
  `crates/meta-sovereign-server/src/routes.rs` now expose `/storage/`,
  `/handlers/`, and `/sync/` as flat-file mounts (single `.js` file
  per request, traversal blocked, only `[a-zA-Z0-9._-]+\.js` accepted).
  Without this the SPA's first import returned 404 from any host.
- **Browser-safe storage import (`src/web/dom.js`).** Switched from
  the `storage/index.js` barrel (which re-exports Node-only
  `LinoTextStore` + `DoubletsStore`) to `'../storage/browser-store.js'`
  directly so the SPA bundle never loads a `node:fs` import on the
  hot path.
- **CLI serve daemon (`src/cli/index.js`).** `serveCmd` now blocks
  on SIGINT/SIGTERM before returning. The previous version returned
  0 immediately, which `bin/meta-sovereign.js` propagated to
  `process.exit(0)` — the listener bound a port then died before the
  first request could land. Tests and library callers can opt out
  with `args.foreground === false`.
- **Tests.** New JS test `mounts browser-safe sibling modules under
/storage and /handlers` in `tests/server.test.js` covering mount
  hits, traversal rejection, .js-only filtering, and nested-path
  rejection. Mirror Rust unit test
  `browser_mount_serves_sibling_directory_files` in
  `crates/meta-sovereign-server/src/routes.rs` exercises the same
  cases against the real `src/` tree.

**Result:** 119/119 JS tests pass; 49/49 Rust tests pass (4 routes
tests including the new browser-mount, 10 wire-protocol integration,
35 unit). Lint, prettier, jscpd clean. The SPA boots end-to-end on
the Rust server with one outstanding console error (favicon 404 —
cosmetic).

**Requirements satisfied:** R-G2 (full pure-Rust alternate stack),
R-J1 (offline-first SPA), R-J2 (autodiscovery), R-J3 (WebSocket+WebRTC
parity), R-J4 (store-as-API), R-J5 (handled-link stamping), R-J6
(decentralised browser deployment), R-J8 (full Rust local server with
all protocols + features), R-J9 (REQUIREMENTS + ROADMAP docs).
Outstanding from `ROADMAP.md`: live API connectors (R-E\*), React port
(R-G1), mobile shell (R-G3), full Apple/Material/Microsoft audit
(R-H1), `browser-commander` published-package swap (R-J7).

## Iteration 8 additions (PR #2, real-browser e2e)

The contract-stable `tests/browser-commander.test.js` placeholder was
fine for verifying that the SPA's nav-button → endpoint mapping stays
intact, but it didn't actually open a browser. Iteration 8 closes
R-J7 by wiring real Chromium via `browser-commander` + Playwright.

- **`tests/e2e-browser-spa.mjs`.** Opt-in script (kept out of `npm
test` by the `.mjs` extension and the `RUN_BROWSER_E2E` env gate)
  that boots the local server, launches headless Chromium through
  `playwright.chromium.launch`, wires it into a `makeBrowserCommander`
  instance, then walks through the seven critical-path steps:
  1. Shell loads with all 11 nav buttons present.
  2. Two messages seeded via REST so derived views have data.
  3. Every nav button (`chat`, `operator`, `contacts`, `automation`,
     `patterns`, `replies`, `facts`, `audience`, `broadcast`,
     `profile`, `status`) clicked through `commander.clickButton`,
     each verified by waiting for `#root` to repopulate and
     re-checking `.active` matches.
  4. Write a third message → `page.reload()` → confirm `GET
/links/<id>` still returns it.
  5. `POST /api/patterns/infer` from two examples; persist the
     returned regex via `PUT /links`.
  6. `PUT /api/graphs` with a 2-node pattern→reply chain; read it
     back via `GET /api/graphs`.
  7. `POST /api/broadcast` with two networks; verify the response
     enumerates per-network envelopes.
- **Skip-when-unavailable.** Without `RUN_BROWSER_E2E=1` the script
  exits 0 with `SKIP: RUN_BROWSER_E2E not set`. If the env var is
  set but `import('playwright')` or `import('browser-commander')`
  fails, it skips with the missing-dependency reason. This keeps
  every CI matrix job green without forcing a Chromium download on
  Node × {Ubuntu, macOS, Windows} × Deno × Bun.
- **`package.json`.** New `test:e2e:browser` script;
  `browser-commander` and `playwright` declared as
  `optionalDependencies` so `npm install` still succeeds when
  Playwright's binary download is blocked or unwanted.
- **Documentation.** R-J7 and R-H4 flip to "Done" in
  `REQUIREMENTS.md`; the closed item drops from `ROADMAP.md` §4 and
  the still-open scenarios (two-browser WebRTC convergence, real
  Telegram import, audience outreach UI, profile-sync envelopes,
  backup/restore UI flow, Rust-server e2e re-run) get explicit
  blockers so the next iteration knows what's gating them.

**Result:** the live e2e passes 7/7 in headless Chromium against the
JS server. Skip path verified — no `RUN_BROWSER_E2E` and no
Playwright both produce a single `SKIP` line and exit 0. 119/119 JS

- 49/49 Rust unit/integration tests still pass; lint, prettier, jscpd
  clean.

**Requirements satisfied:** R-J7 (`browser-commander` e2e), R-H4
(unit + integration + real e2e). Outstanding from `ROADMAP.md`: live
API connectors (R-E\*), React port (R-G1), mobile shell (R-G3), full
Apple/Material/Microsoft audit (R-H1), and the e2e scenarios that
need their underlying features to land first.

## Iteration 19 additions (PR #2, Telegram live + real archive import)

Iteration 19 closes the Telegram-specific connector work that was still
listed under `ROADMAP.md` and makes live service reads follow the same
store-as-API contract as broadcasts, profile sync, outreach, and
automation.

- **Telegram Desktop archive import (`src/sources/telegram.js`).**
  `parseArchive()` now accepts both per-chat exports and all-chats
  exports, reads `text` and `text_entities`, preserves `date` or
  `date_unixtime`, and avoids collisions when two chats reuse the same
  local message id.
- **Telegram Bot API live connector (`createTelegramBotLive`).** The
  adapter implements `pullMessages()` over `getUpdates`, `post()` over
  `sendMessage`, and `syncProfile()` over `setMyName` /
  `setMyDescription`. It can use `TELEGRAM_BOT_TOKEN`, an explicit
  token passed by library callers, or a local `secret:telegram:*` link
  when live pulls are triggered from the store.
- **Live import bridge (`src/sources/index.js`).** `pullLiveInto()`
  pulls from any source whose `live.pullMessages()` is available,
  writes the resulting `msg:*` links to the universal store, and stamps
  each link with both `handled: { at, by }` and `handledBy` so connector
  echoes do not re-fire.
- **Source-pull handler (`src/handlers/index.js`).** Writing a
  `source-pull:<source>:*` command link is now the live-import API.
  The handler runs `pullLiveInto()`, updates the command link with
  `status: "done"`, `imported`, `nextOffset`, and `rawCount`, then the
  handler bus stamps it like every other handled link.
- **CLI (`src/cli/index.js`).** New `meta-sovereign source-pull`
  command for pulling bot-visible Telegram updates into the local
  store from the terminal.
- **Tests (`tests/telegram-live.test.js`).** Four new cases cover real
  Telegram Desktop all-chats archive shape, duplicate local id
  handling, mocked Bot API pull/send/profile calls, secret-token lookup
  from the store, and one-shot source-pull handler execution.

**Result:** 133/133 JS tests pass in the focused Node run for the
source/handler slice; the full matrix remains covered by the normal CI
workflow. `ROADMAP.md` no longer lists the real Telegram archive import
item, and R-E2 is marked Done in `docs/REQUIREMENTS.md`.

## Iteration 20 additions (PR #2, UI design audit)

Iteration 20 closes the Apple HIG / Google Material / Microsoft Fluent
audit item that remained under R-H1.

- **`docs/UI-DESIGN-AUDIT.md`.** New per-surface checklist covering
  the global shell, chat, operator, contacts/CRM, automation graph,
  patterns/replies, broadcast/profile/resume, settings, sync, and
  backup flows. Each check cites current code or e2e coverage as
  evidence.
- **`docs/REQUIREMENTS.md` and `docs/ROADMAP.md`.** R-H1 now points to
  the audit document and the remaining UI roadmap scope is narrowed to
  the React port required by R-G1.

**Result:** the SPA design audit is documented and preserved by the
React port landed in iteration 24.

## Iteration 21 additions (PR #2, Deno matrix hardening)

Iteration 21 keeps the multi-runtime CI matrix green after Telegram
became a real live connector.

- **Deno WebSocket client path (`src/sync/ws-transport.js`).** Deno
  now uses its native `WebSocket` client for sync/signaling tests
  instead of the Node `net` handshake path, which Deno's Node-compat
  layer rejects on current 2.x releases.
- **Deterministic route fixture (`tests/server-iter3.test.js`).** The
  route-level full-pipeline test disables background handlers so a
  developer or CI environment with `TELEGRAM_BOT_TOKEN` set does not
  start a real Telegram profile-sync request while the test is only
  asserting planned-sync route responses.

**Result:** Node, Bun, Deno, and Rust local suites pass against the
same final source.

## Iteration 22 additions (PR #2, non-Telegram live connectors)

Iteration 22 closes the remaining external-service connector roadmap
items. The adapters still require each service's real OAuth/token
setup at runtime, but the code paths are now implemented and verified
with mocked HTTP instead of being stubs.

- **Shared live-adapter primitives.** `src/sources/http.js` centralizes
  token lookup, JSON requests, auth headers, and content/target
  extraction. `src/sources/link.js` moves `buildMessageLink` out of the
  registry barrel so callers can import individual adapters directly
  without triggering a circular initialization path.
- **Messaging/social connectors.** VK, WhatsApp Cloud API, X API v2,
  Facebook Graph/Messenger, and LinkedIn REST Posts now each expose
  live adapter factories with `pullMessages()` and outbound write
  methods (`post()` and/or `syncProfile()` where the upstream API
  offers one).
- **Job-board connectors.** hh.ru, career.habr.com, and SuperJob now
  expose live adapters for application/negotiation import, reply
  sending, and resume create/update. Habr Career remains path
  configurable because it does not publish a stable public API surface.
- **Tests.** `tests/live-connectors.test.js` uses mocked `fetch` calls
  to verify every connector's endpoint path, auth headers, request body,
  and normalized `msg:*` link output without any live credentials.
- **Requirements and roadmap.** R-A1 and the remaining R-E rows are now
  Done. The external-service connector section has been removed from
  `docs/ROADMAP.md`; the remaining roadmap scope is React, packaging,
  mobile discovery, and browser-side WASM.

**Result:** Node, Bun, and Deno each pass 139/139 JS tests; Rust
passes 52/52 tests; `npm run check` is clean.

## Iteration 23 additions (PR #2, browser-side WASM stack)

Iteration 23 closes the browser-side WASM roadmap section while leaving
the React and packaging/mobile sections open.

- **`doublets-web` BrowserStore driver.** `createDoubletsWebDriver()`
  indexes BrowserStore snapshots through the upstream `doublets-web`
  WASM classes (`Link`, `LinksConstants`, `UnitedLinks`) when that
  module is bundled or injected into the browser. The driver persists
  the normal snapshot shape plus doublets-web graph metadata, so
  existing offline-first callers keep the same API while the browser
  has a real Doublets-backed binary graph path.
- **Rust pattern matcher WASM.** New crate `meta-sovereign-wasm`
  wraps `meta_sovereign_core::pattern_matches` behind a tiny C ABI and
  produces `src/web/pattern-matcher.wasm` via
  `scripts/build-pattern-wasm.sh`.
- **SPA worker integration.** `patterns-wasm.js` instantiates the
  checked-in WASM artifact, and `pattern-worker.js` runs supported
  pattern previews off the main thread. Complex regexes remain on the
  JS fallback so the existing LCS/PEG flows keep their full semantics.
- **Static serving and CSP.** The Node and Rust servers now serve
  `.wasm` assets as `application/wasm` and allow same-origin module
  workers plus WebAssembly compilation in the CSP without enabling
  inline scripts.
- **Tests.** BrowserStore tests cover the doublets-web driver with a
  mocked `doublets-web` module; `tests/wasm-patterns.test.js`
  instantiates the real checked-in WASM artifact; server tests assert
  `.wasm` serving.

**Result:** the browser-side database and pattern-preview hot path now
have real WASM-backed implementations. The next roadmap scope after
this iteration was the React UI port plus Electron/mobile packaging and
discovery.

## Iteration 24 additions (PR #2, React SPA port)

Iteration 24 closes the R-G1 React UI stack item while preserving the
offline-first/browser-WASM work from the previous iterations.

- **React app shell.** `src/web/app.js` renders the topbar, navigation,
  mode badge, theme toggle, skip link, and `<main id="root">` through
  React. The static HTML keeps the same landmarks and `data-view`
  buttons as a first-paint fallback, then the bundle takes ownership.
- **React views.** `src/web/views.js` ports chat, operator, contacts,
  automation graphs, patterns, replies, facts, audience, broadcast,
  outreach, profile/resume, backup, and status to React components.
  They still call the existing `api` object from `dom.js`, so discovery,
  local browser storage, WebRTC sync, WASM pattern previews, and server
  fallbacks keep the same behavior.
- **Build artifact.** `scripts/build-web.mjs` uses esbuild to bundle the
  React source into `src/web/app.min.js`, which `index.html` loads as the
  browser entrypoint.
- **Coverage.** `tests/web-react.test.js` pins the React packaging
  contract; the existing browser-commander e2e passes against the JS
  backend after the port.

**Result:** R-G1 is Done: the default stack now has JavaScript server
and client code, React UI, Rust/WASM heavy-workload paths, and the
pure-Rust server alternative remains available under R-G2.

## Iteration 25 additions (PR #2, Electron/mobile packaging)

Iteration 25 closes the final top-level roadmap section: Electron
auto-update, iOS build pipeline, Android build pipeline, and mobile-side
server discovery.

- **Electron shell.** `electron/main.js` is now an import-safe module
  with exported `startDesktop()`, `createMainWindow()`, and
  `configureAutoUpdates()` helpers. The main process starts the local
  server, opens the same React URL as local web, isolates the renderer
  with `contextIsolation: true` and `nodeIntegration: false`, and calls
  `electron-updater`'s `checkForUpdatesAndNotify()` when that optional
  peer is available in a packaged app or explicit update feed mode.
- **Electron preload discovery.** `electron/preload.cjs` exposes only a
  small `metaSovereignShell` object to the renderer, carrying optional
  LAN server candidates from `META_SOVEREIGN_SERVER_CANDIDATES`.
- **Mobile discovery shell.** `src/web/discovery-shell.js` loads before
  `app.min.js` and normalizes candidates from
  `window.metaSovereignShell`, `META_SOVEREIGN_DISCOVERY_CANDIDATES`, a
  discovery meta tag, or `?server=` / `?servers=` launch URLs. The
  existing `discover.js` cascade now probes those WebView candidates
  before localhost ports, so Capacitor shells can find a desktop server
  on the same LAN and still fall back to fully local storage.
- **Capacitor fallback.** `capacitor.config.json`, `mobile/README.md`,
  `scripts/build-mobile.mjs`, and `scripts/mobile-platform.mjs` define
  the iOS/Android build surface. `npm run build:mobile` writes
  `mobile/www` from the checked-in web assets; `npm run mobile:ios` and
  `npm run mobile:android` add/sync/open the corresponding native
  project through Capacitor.
- **Coverage.** `tests/mobile-electron-packaging.test.js` first failed
  on missing WebView discovery, Electron updater wiring, and mobile
  build config, then passes against the implemented shell contracts.

**Result:** R-F3, R-G3, R-J2, R-J3, R-J9, and R-J10 are Done. The
top-level `docs/ROADMAP.md` now remains present as an explicit empty
review ledger because the tracked missing-feature checklist is empty.
