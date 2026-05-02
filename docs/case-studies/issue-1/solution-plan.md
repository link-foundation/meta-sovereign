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

**Update (PR #2 expansion)**: at the maintainer's request the PR was expanded beyond docs to land a runnable, zero-dependency skeleton that exercises every architectural layer of the plan below. Each milestone's status is annotated with `[skeleton in PR #2]` where this PR ships an importable, tested implementation, and `[follow-up]` where production-grade work remains. The skeleton is intentionally minimal (in-memory adapters, JSON archive parsers, no real network I/O) — it lets the tests, CLI, server, Electron shell, Docker compose, and Rust workspace all boot end-to-end so subsequent PRs can iterate per layer without re-bootstrapping.

---

## Milestone 1 — Storage skeleton (Universal Links Access) [skeleton in PR #2]

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

## Milestone 2 — Backups & `.lino` import/export [skeleton in PR #2]

**Requirements:** R-A1, R-A2, R-A4.

**Deliverables:**

1. `meta-sovereign backup` CLI subcommand that snapshots the storage directory to `${backup_dir}/YYYY/MM/DD/HH-MM-SS.tar.zst`.
2. Retention policy configurable via `lino-arguments` (keep N daily, M weekly, etc.).
3. `meta-sovereign import --file=foo.lino` and `meta-sovereign export --file=bar.lino`.
4. e2e test: import → mutate → export → diff yields a recognisable change set.

**Tools:** `lino-arguments`, `tar`, `zstd-codec` or `node:zlib`/system `zstd`.

---

## Milestone 3 — First importer adapter (Telegram) [skeleton in PR #2]

**Requirements:** R-E2, R-A1, partial R-D1.

Telegram is the first adapter because the konard repos already provide a working implementation (`telegram-bot`, `follow`, `telegramify-markdown`).

**Deliverables:**

1. NPM package `@meta-sovereign/source-telegram` implementing `MessageSource`.
2. `meta-sovereign import --source=telegram --archive=path` for Telegram Desktop JSON exports.
3. `meta-sovereign import --source=telegram --takeout` for the live Takeout API.
4. Mapping from Telegram message → unified `Message` link, including: sender, chat, timestamp, reply-to, edits, media references.
5. Integration tests against fixture archives.

---

## Milestone 4 — Second importer (VK), establishes the adapter pattern [skeleton in PR #2]

**Requirements:** R-E1, R-A1.

**Deliverables:**

1. `@meta-sovereign/source-vk` wrapping `vk-export` (HTML archive) and the Kate-Mobile token pipeline (`vk-bot` / `vk-browser`).
2. The `MessageSource` interface is finalised based on lessons from Telegram + VK; documented in `architecture.md` as stable.
3. Tests against real archive samples (anonymised).

---

## Milestone 5 — Unified Chat UI (read-only) [follow-up]

**Requirements:** R-B1.

**Deliverables:**

1. NPM package `@meta-sovereign/web` — a React + Vite app that reads from `UniversalLinksAccess` over HTTP/WebSocket.
2. Chat list, message list with virtualised scrolling, search bar (powered by MiniSearch).
3. UI quality bench-marked against Telegram Desktop.
4. e2e tests via `browser-commander`.

**Out of scope at this milestone:** sending messages back, auto-completion, operator mode, multi-network differences (each network is rendered the same way).

---

## Milestone 6 — Operator UI [follow-up]

**Requirements:** R-B3, partial R-B2.

**Deliverables:**

1. Card-stream view modeled on `link-assistant/operator`. Two actions: DONE / NEXT.
2. Auto-completion in the message composer fed by MiniSearch over the user's outgoing messages.
3. Keyboard-driven workflow (D / N for DONE/NEXT, ⌘↵ to send, etc.).
4. e2e tests for the queue progression.

---

## Milestone 7 — Pattern editor + reply-variation editor [skeleton in PR #2]

**Requirements:** R-C1, R-C2, R-C5.

**Deliverables:**

1. NPM package `@meta-sovereign/patterns` with a `Pattern` model (regex or PEG via Ohm-JS), simplification heuristics, and an example-driven generator.
2. NPM package `@meta-sovereign/replies` with a `ReplyVariationGroup` model and a Fuse.js-based fuzzy candidate finder.
3. UI: pattern editor (left: examples, right: live regex/PEG, bottom: matches), reply-variation editor (group list with tag chips).
4. Fact extractor that, given a patterns set, scans conversations for `question → answer` pairs (R-C5). Output rendered per participant in group chats.

---

## Milestone 8 — Dialog automation graph [skeleton in PR #2]

**Requirements:** R-C3, R-C4.

**Deliverables:**

1. Rete.js v2 canvas integrated into `@meta-sovereign/web`.
2. Node types: `PatternNode`, `BranchNode`, `ReplyVariationNode`, `SendMessageNode`, `WaitForNode`.
3. Two run modes (auto / semi-auto). Semi-auto surfaces candidate replies in the Operator UI.
4. The graph is persisted via `UniversalLinksAccess` so it is part of the unified database.

---

## Milestone 9 — CRM features [skeleton in PR #2]

**Requirements:** R-D1, R-D2, R-D3, R-D4, partial R-D5/R-D6.

**Deliverables:**

1. Contact-detail page that aggregates everything known (chats, groups, communities, extracted facts).
2. Saved-query language for set intersections (e.g. `group("Foo") AND fact("speaks_russian")`).
3. Mass-personal kick-off helper (templated greeting per contact in a saved query).
4. Local search (R-D4) wired to MiniSearch + Fuse.js.

---

## Milestone 10 — Sync layer (WebRTC + CRDT) [skeleton in PR #2]

**Requirements:** R-F5, R-F6.

**Deliverables:**

1. `automerge-repo` integrated against `UniversalLinksAccess`.
2. WebRTC adapter (`@automerge/automerge-repo-network-webrtc`).
3. Optional Docker microservice `meta-sovereign-rtc` that runs the signalling server (R-F6).
4. End-to-end test: two browsers connect, mutate, see each other's changes.

---

## Milestone 11 — Outbound broadcasting & profile sync [skeleton in PR #2]

**Requirements:** R-B4, R-D5, R-D6.

**Deliverables:**

1. `@meta-sovereign/broadcast` integrating `konard/broadcast` for X / Telegram / VK posting.
2. Profile sync UI that pushes the user's avatar / bio to every authenticated network (gracefully no-ops where APIs forbid it).
3. Resume sync for hh.ru, career.habr.com, superjob.ru, LinkedIn (R-E6, R-E7, R-E8, R-E9).

---

## Milestone 12 — Remaining importers [skeleton in PR #2]

**Requirements:** R-E3, R-E4, R-E5, R-E6, R-E7, R-E8, R-E9.

**Deliverables:**

1. `@meta-sovereign/source-x` (X archive importer).
2. `@meta-sovereign/source-whatsapp` (per-chat export importer).
3. `@meta-sovereign/source-facebook` (download-your-data archive).
4. `@meta-sovereign/source-linkedin` (data export archive).
5. `@meta-sovereign/source-habr-career`, `@meta-sovereign/source-hh`, `@meta-sovereign/source-superjob` (resume + applications sync).

Each follows the `MessageSource` interface finalised in milestone 4.

---

## Milestone 13 — Pure-Rust stack [skeleton in PR #2]

**Requirements:** R-G2.

**Deliverables:**

1. `meta-sovereign-rs/server` (`axum` + `doublets-rs` + Rust lino codec).
2. `meta-sovereign-rs/cli`.
3. Conformance test suite that runs the same fixture imports through both stacks and diffs the resulting Doublets file.

---

## Milestone 14 — Mobile and Electron polish [skeleton in PR #2]

**Requirements:** R-F3, R-G3, R-H1.

**Deliverables:**

1. Electron app via `deep-foundation/sdk`, with auto-update.
2. Mobile builds via Capacitor (or Tauri 2 if `deep-foundation/sdk` is not yet mobile-ready).
3. HIG / Material / Microsoft design audit per surface.

---

## Cross-milestone concerns

- **Each milestone ships a changeset** describing the new packages and any user-visible changes.
- **Each milestone updates `requirements.md` traceability** — which IDs are now done, which are partial.
- **CI gaps** (vs the JS template / Rust template) discovered during a milestone are filed as issues against the upstream template.
- **Documentation site** is regenerated whenever an `@meta-sovereign/*` package version bumps.

## Definition of done for v0.0.1

The smallest end-to-end demo that exercises every architectural layer is:

> Import a Telegram archive, see the conversations in the Unified Chat UI, build a "thank-you" pattern + reply variation, run the dialog graph in semi-auto mode, accept the reply, see the reply broadcast back to the network, sync the new state to a second browser via WebRTC.

Reaching this end-to-end demo requires Milestones 1, 2, 3, 5, 6, 7, 8, 10, 11. Milestones 4, 9, 12, 13, 14 expand the system but are not on the critical path for the first demo.

---

## Iteration 2 additions (PR #2, follow-up commits)

Building on the layered skeleton, this iteration thickens the most user-visible
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

Total automated tests: **54**, all green. Lint and jscpd clean. The remaining
milestones (mobile/electron polish, pure-Rust stack, full WebRTC transport)
stay as skeleton stubs and are deferred to follow-up PRs per their milestone
sections above.

---

## Iteration 3 additions (PR #2, full-vision push)

Iteration 3 closes the remaining `[skeleton in PR #2]` annotations into
`[done in PR #2]` for everything reachable without external services. The
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
had left as TODOs: the SPA must work fully offline using browser
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
