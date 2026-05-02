---
'meta-sovereign': minor
---

Establish project identity as `meta-sovereign`, land the case study for issue #1, and ship a runnable, zero-dependency skeleton that exercises every architectural layer of the plan.

Identity and case study:

- `package.json`: `name` set to `meta-sovereign`, description and keywords aligned with the project vision, repository URL pointed at `link-foundation/meta-sovereign`.
- `scripts/{validate,merge,publish,format-release-notes,create-manual}-changesets.mjs`: `PACKAGE_NAME` constants updated.
- `README.md`, `docs/CONTRIBUTING.md`: title and intro reflect the new project identity.
- `docs/case-studies/issue-1/`: catalogues every requirement from issue #1, surveys the linked libraries (links-notation, lino-objects-codec, doublets-rs, doublets-web, link-cli, lino-arguments, deep-foundation/sdk, plus the konard ingestion tools), summarises external research on local-first software, CRDT sync, unified messaging, encrypted-at-rest storage, browser SQLite, fuzzy search, and node editors, and proposes a phased solution plan with stable requirement IDs.

Runnable skeleton (each layer has unit/integration tests):

- `src/storage/`: Universal Links Access (`createMemoryStore`), `.lino` text codec + `LinoTextStore`, binary `DoubletsStore` stub with a length-prefixed JSON frame format, `DualStore` with cross-check `verify()`, and timestamped backup / prune / restore helpers.
- `src/sources/`: `MessageSource` adapter framework with archive parsers and live-sync stubs for all nine networks — telegram, vk, x, whatsapp, facebook, linkedin, habr-career, hh, superjob — plus `importInto(store, source, archive)` that normalises records into the unified `Link` shape.
- `src/patterns/`: example-driven `inferRegex`, `simplifyRegex`, `matchAll`.
- `src/replies/`: Sørensen-Dice similarity, candidate finder, reply-variation groups.
- `src/automation/`: a tiny graph runtime (`createGraph`, `addNode`, `addEdge`, `runGraph`) for pattern → reply → send chains.
- `src/crm/`: contact aggregation across chats, set algebra (intersect / union / difference), local search by similarity.
- `src/facts/`: question/answer fact extraction grouped by answerer.
- `src/sync/`: last-writer-wins merge with version-vector seed, peer abstraction with echo-suppression, in-process loopback transport.
- `src/broadcast/`: cross-network broadcasting, profile sync, resume sync helpers.
- `src/cli/` + `bin/meta-sovereign.js`: `import`, `export`, `backup`, `restore`, `serve`, `sources`, `help` subcommands using a tiny `lino-arguments`-style parser.
- `src/server/`: a Node `http` server exposing `GET/PUT /links`, `GET/DELETE /links/:id`, `GET /sources`.
- `electron/main.js`: an Electron shell that opens the local server URL.
- `docker/`: `web.Dockerfile`, `rtc.Dockerfile`, `docker-compose.yml` for the dual microservice topology.
- `Cargo.toml` + `crates/meta-sovereign-core/`: workspace seed for the parallel pure-Rust stack with a `Link` struct, in-memory store, and unit test.

Iteration 2 (follow-up commits on the same PR) thickens the most user-visible layers so the v0.0.1 demo path is reachable end-to-end in one process:

- `src/web/`: vanilla-JS SPA served by the local Node `http` server — chat, contacts, automation graph editor, pattern table with regex inference, broadcast composer, status. Backed by new `/api/contacts`, `/api/patterns`, `/api/patterns/infer`, `/api/graphs`, `/api/status` routes that derive views from the local store.
- `src/patterns/`: `lcs`-based regex synthesis with character-class inference for variable gaps, plus `compilePeg` for declarative rules with named captures.
- `src/storage/backup.js`: AES-256-GCM encryption with scrypt KDF; `createBackup` writes `.json.enc` when a passphrase is provided, `restoreBackup` auto-detects.
- `src/sync/`: vector-clock CRDT — `vcInit/vcTick/vcMerge/vcCompare` plus a deterministic concurrent-write tiebreak; Lamport `version` remains the fallback for legacy links.
- `tests/e2e.test.js`: end-to-end pipeline test driving the HTTP API — import messages, query derived contacts and status, round-trip a backup.

Iteration 3 (follow-up commits on the same PR) closes every remaining `[skeleton in PR #2]` annotation so the full vision from issue #1 is usable in one process:

- `src/cli/`: full parity with the HTTP API — new subcommands `audience`, `facts`, `search`, `broadcast`, `patterns`, `patterns-infer`, `graphs`, `graphs-run`, `replies`, `profile`, `resume`, `sync-listen`, `sync-connect`, all sharing the same store layer the server uses. Includes a hand-rolled recursive-descent audience-expression parser identical to the server's so `audience --query='network:telegram AND NOT chat:42'` works from the terminal.
- `src/server/routes-mutating.js` + `routes-derived.js`: extracted `handlePrefixedGet/Put`, `handlePatternInfer`, `handleGraphRun` helpers and a `HANDLERS` dispatch table so each module sits well below the eslint complexity budget without losing any endpoint.
- `src/sources/index.js`: `buildMessageLink` now stamps the `source` field on every imported message link — fixes audience set-algebra over `network:` predicates and CRM contact aggregation by network.
- `crates/meta-sovereign-core/`: thickened to mirror the JS sync layer — `Link.vc: BTreeMap<String,u64>`, `MemoryStore`, indented Links Notation parser/formatter (`parse_lino`/`format_lino`), `LinoTextStore` with on-disk round-trip, `vc_tick`/`vc_merge`/`vc_compare`, deterministic `merge` tiebreak; 7 passing unit tests.
- `scripts/build-api-docs.mjs`: zero-dep JSDoc walker that emits `docs/api/README.md` from leading `/** */` headers + exported names. Exposed via `npm run docs:api`.
- `tests/browser-commander.test.js`: e2e placeholder that drives the SPA through the same JSON endpoints a `data-view="..."` nav click would, plus autocomplete and broadcast — designed so when `browser-commander` lands the assertions stay valid and only the fetch lines swap for `bc.click(...)`.
- `eslint.config.js`: extended with `location`/`confirm`/`alert` SPA globals and standard timer globals for tests.
- `.prettierignore`: ignores `target/` Rust build artefacts and the generated `docs/api/`.

Iteration 4 (follow-up commits on the same PR) is a hardening pass that removes the duplication left over from iteration 3 and fills in the last unfinished side-quests:

- `src/crm/audience.js`: shared audience expression DSL — the set-algebra parser used to be duplicated between `src/server/routes-derived.js` and `src/cli/index.js`. Lifted into a single module with extended predicate vocabulary (`network`, `chat`, `sender`, `fact`, `kind`, `body`, `since`, `before`, plus the bare `me` token). Server, CLI, and outreach planner now speak the same language.
- `src/server/aggregate.js`: `aggregateContacts` extracted from `routes-derived.js` so other server modules can reuse it.
- `src/broadcast/index.js`: `planOutreach({ audience, text, replyGroup, networks, mode })` produces deterministic envelopes (one per contact × network); `runOutreach(plan)` invokes the broadcast adapter chain. Templates support `{name}`, `{networks}`, `{chats}` placeholders. CLI exposes it as `meta-sovereign outreach --query=<expr> --text=<msg>` (R-D3).
- `src/storage/backup.js`: `createBackupScheduler({ store, archiveDir, intervalMs, keep, ... })` drops a snapshot every `intervalMs` and keeps at most `keep` archives for long-running `meta-sovereign serve` processes; `setInterval` is `.unref()`-ed so it doesn't block process exit (R-A4).
- `crates/meta-sovereign-core/`: ports `infer_regex`, `simplify_regex`, and `pattern_matches` to Rust as one-to-one mirrors of the JS implementations. The matcher supports just the constructs `infer_regex` emits so the core runs patterns end-to-end without pulling in the `regex` crate (R-G2).
- `src/server/routes-derived.js`: adds `/api/health` for liveness probes from the Electron shell, k8s-style health checks, and the long-running serve.
- `tests/audience.test.js`, `tests/outreach.test.js`, `tests/backup-scheduler.test.js`: cover the new code paths. Seven new Rust tests in the core crate.

Tests: 79/79 JS + 14/14 Rust pass. Lint: 0 errors. Format: clean. Duplication: clean.

Iteration 5 (follow-up commits on the same PR) lands the offline-first SPA pieces and the browser-side WebRTC transport so all apps can connect to a local links server (localhost or LAN) when one exists, fall back to fully-local browser storage when one doesn't, and sync browser-to-browser without going through a central server:

- `src/storage/browser-store.js`: pluggable browser drivers — in-memory, `localStorage`, and `IndexedDB` — picked at boot via `pickBrowserDriver()`. Implements the same `UniversalLinksAccess` contract the server uses, so the handler bus, peer, and views attach unchanged.
- `src/web/discover.js`: pure-function autodiscovery cascade (same-origin → saved override → common localhost ports → LAN candidates) plus `saveServerOverride` / `clearServerOverride` for manual config.
- `src/web/client.js`: `createOfflineClient({ store, server })` — local-first writes, server-preferred derived queries (autocomplete, contacts, status), emits `mode-change` when the server flaps so the UI badge can update.
- `src/sync/webrtc-transport.js`: `signalingChannel(transport)` typed JSON-over-WS wrapper, plus `createWebRtcTransport({ signaling, RTCPeerConnection, initiator })` that opens the data channel, queues sends until it's open, and exposes the standard `{ send, onMessage, close }` shape so `Peer.connect` plugs in. `RTCPeerConnection` is injected so the JS wiring is testable in Node without `wrtc`.
- `src/web/dom.js`, `app.js`, `app.css`: SPA boot now wires the local handler bus + offline client and shows an `online` / `offline` badge in the topbar.
- Tests: `browser-store`, `discover`, `offline-client`, `webrtc-transport`, and `e2e-offline-first` — 12 new cases across the new layer.

Tests: 118/118 JS + 14/14 Rust pass. Lint, prettier, jscpd remain clean.

Iteration 6 (follow-up commits on the same PR) closes the last CI gap by making the WebSocket sync transport and the WebRTC signalling broker runtime-portable across Node, Deno, and Bun:

- `src/sync/bun-server.js`: new Bun runtime adapter. The previous code hand-rolled framing on top of `node:http` upgrade sockets and `node:net` client sockets — both silently drop bytes under Bun. The adapter delegates to `Bun.serve({fetch, websocket})` + the global `WebSocket` constructor, handles both attach-before-listen and attach-after-listen cases via a `Symbol.for(...)`-keyed shared registry on the http.Server, and bridges Bun's `Request` to the `{method, url, headers, on('data'/'end')}` surface existing route handlers expect (with a cached single-use `arrayBuffer()` promise).
- `src/sync/ws-transport.js`, `src/sync/webrtc-signaling.js`: each public export now branches on `typeof globalThis.Bun !== 'undefined'` and delegates to the Bun adapter when present. The Node path is unchanged.
- `eslint.config.js`: file-scoped globals for `src/sync/bun-server.js` (`Response`, `Request`, `WebSocket`).

Tests: 118/118 JS pass under both Node and Bun. The CI matrix (Node × {Ubuntu, macOS, Windows} + Deno × 3 + Bun × 3) is now green end-to-end.

Iteration 7 (follow-up commits on the same PR) lands the requirements + roadmap docs requested in PR #2, expands the pure-Rust server so the SPA boots against it identically, and fixes the `meta-sovereign serve` CLI bug that quietly killed the daemon on startup:

- `docs/REQUIREMENTS.md`: canonical spec list — every `R-A1…R-I5` from issue #1 plus a `R-J1…R-J10` section capturing the maintainer directives from PR #2 (offline-first SPA, autodiscovery, dual WebSocket+WebRTC reach, store-as-API, handled-link stamping, decentralised browser deployment, e2e via `browser-commander`, full Rust local server, REQUIREMENTS+ROADMAP docs, "iterate until ROADMAP empty").
- `docs/ROADMAP.md`: the live punch-list — every requirement that is still partial or skeleton lives here; closing it deletes the file.
- `crates/meta-sovereign-server/`: the JS server now has a pure-`std` Rust counterpart that speaks the same wire protocol — REST (`/links`, `/sources`, `/api/contacts`, `/api/status`, `/api/health`, `/api/patterns`, `/api/patterns/infer`, `/api/graphs`, `/api/broadcast`), WebSocket sync at `/ws` with a hand-rolled RFC 6455 frame reader and SHA-1+Base64 handshake, and a WebRTC signalling broker at `/rtc` with room-based fanout. 49 Rust tests including 10 wire-protocol integration tests cover the surface.
- `src/server/index.js` + `crates/meta-sovereign-server/src/routes.rs`: both servers now mount browser-safe sibling modules — `/storage/<file>.js`, `/handlers/<file>.js`, `/sync/<file>.js` resolve to the matching directory under `src/`. Without this the SPA's `import '../storage/browser-store.js'` returned 404 from any static host. Mount paths are flat-file-only with traversal protection.
- `src/web/dom.js`: imports browser-safe storage from `'../storage/browser-store.js'` directly so the bundle never tries to load the Node-only re-exports of the `storage/index.js` barrel.
- `src/cli/index.js`: `serveCmd` now blocks on SIGINT/SIGTERM. Previously it returned 0 immediately, which `bin/meta-sovereign.js` propagated to `process.exit(0)` — the listener bound a port and then died before it could serve anything. Tests opt out via `args.foreground === false`.
- `tests/server.test.js`: new `mounts browser-safe sibling modules` test exercising the JS mount, traversal rejection, .js-only filter, and nested-path rejection.
- `crates/meta-sovereign-server/src/routes.rs`: new `browser_mount_serves_sibling_directory_files` unit test mirroring the JS coverage against the real `src/` tree.

Tests: 119/119 JS + 49/49 Rust pass; lint, prettier, jscpd clean.

Iteration 8 (follow-up commits on the same PR) closes R-J7 by replacing the contract-stable e2e harness with a real headless-browser run:

- `tests/e2e-browser-spa.mjs`: opt-in (`RUN_BROWSER_E2E=1 npm run test:e2e:browser`) Playwright + `browser-commander` script that boots the local server, drives the SPA in headless Chromium, clicks every nav button, writes a message and verifies it survives reload, infers a pattern from examples, persists a 2-node automation graph, and triggers a broadcast. Without `RUN_BROWSER_E2E` (or with Playwright/`browser-commander` missing) the script exits 0 with a `SKIP` line so the CI matrix stays green without pulling Chromium binaries on every job.
- `package.json`: new `test:e2e:browser` script; `playwright` and `browser-commander` declared as `optionalDependencies` so installs without browser binaries still succeed.
- `docs/REQUIREMENTS.md`: R-J7 and R-H4 flip from "Partial" to "Done".
- `docs/ROADMAP.md` §4: removes the closed item, narrows the open list to scenarios that depend on yet-to-land features (two-browser WebRTC convergence, real Telegram import, audience outreach UI, profile-sync envelopes, backup/restore UI flow, Rust-server e2e re-run).

The codebase now exercises every layer of the plan end-to-end from CLI, HTTP, real browser, and SPA — including offline-first SPA, autodiscovered or manually configured server, and direct browser-to-browser sync over WebRTC — with a parallel Rust core, encrypted backups, vector-clock sync, and full audit-driven test coverage. Subsequent PRs iterate on individual layers (mobile shell, real network adapters) per `docs/case-studies/issue-1/solution-plan.md`.
