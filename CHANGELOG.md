# Changelog (languages: en • [zh](CHANGELOG.zh.md) • [hi](CHANGELOG.hi.md) • [ru](CHANGELOG.ru.md))

## 0.18.0

### Minor Changes

- 7092f58: R-N1..R-N12: Mobile-first overhaul of the SPA shell, the connections
  flow, and the tutorial. The new `js/src/web/shell/` module exposes an
  `<AppShell>` that swaps between a compact bottom-nav (≤640 px), a
  navigation rail (641-1023 px), and a permanent drawer (≥1024 px), with
  44 × 44 px tap targets, `:focus-visible` rings, and
  `safe-area-inset-bottom` padding. `js/src/web/app.css` adds Apple
  Liquid Glass tokens (`--surface-glass`, `.glass`, `.glass-strong`) that
  use `backdrop-filter: blur(28px) saturate(180%)` with a solid fallback
  when `prefers-reduced-transparency: reduce` is set. A dedicated
  Connections page lives under `js/src/web/connections/`: the list
  renders one card per provider with translated name, description, and a
  `connected` / `not-connected` / `action-required` state badge, and
  tapping a "not connected" provider routes to a dedicated detail screen
  that walks the user through the provider's `setupSteps[]` (newly
  declared on every entry of `js/src/web/connection-guides.js`). The
  tutorial overlay (`js/src/web/tutorial.js`) gains an element-anchored
  `<TutorialSpotlight>` that dims everything outside a target rect using
  a `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` outset; the default
  sequence opens with a "Connect a service" step pointing at the
  Connections nav entry, with translated copy in `en/ru/zh/hi`. All
  user-facing strings — including the connection guides — now route
  through `t()`, so the Russian build no longer leaks the English
  "Your unified inbox starts empty." literal. Tests:
  `js/tests/connections-screens.test.js`,
  `js/tests/tutorial-spotlight.test.js`, and the existing
  `js/tests/i18n.test.js` parity assertions guard the new surface area.
  Full atomic table and evidence: `docs/case-studies/issue-25/`.

## 0.17.0

### Minor Changes

- 713513d: R-T1..R-T22: Add PeoplePerHour as the thirteenth first-class
  `MessageSource`. The new `js/src/sources/peopleperhour.js` adapter
  normalises projects, proposals, workstreams, rooms, room messages,
  hourstreams, and invoices into `msg:peopleperhour:<external_id>`
  links plus dedicated `project:peopleperhour:`,
  `proposal:peopleperhour:`, `workstream:peopleperhour:`,
  `room:peopleperhour:`, `invoice:peopleperhour:`, and
  `hourstream:peopleperhour:` link kinds. It ships both an archive
  importer (raw REST/array dumps, the
  `{projects, proposals, workstreams, rooms, messages, invoices,
hourstreams}` envelope, and the Earnings CSV sniffed against the
  PeoplePerHour header) and a live REST client at
  `https://www.peopleperhour.com/api/v1` with `Bearer` OAuth 2.0
  auth, REST cursor pagination via the `nextCursor` field, an
  injectable `fetchImpl` for tests, and an `endpointOverrides`
  escape hatch for unverified paths. The live surface adds
  `searchProjects` (`GET /projects/search`), `pullMessages` covering
  both the **proposal** stage (before approval) and the
  **workstream** stage (after approval) from either the **buyer**
  or **freelancer** perspective, and `post` for
  `POST /workstreams/{id}/messages` and
  `POST /proposals/{id}/messages`. To honour the PeoplePerHour API
  ToS, every live-pulled link is stamped with `softCache: true` and
  `cacheTtlMs: 86_400_000` (24 h); `softCacheRetention()` purges
  expired live links while leaving archive imports durable. CLI
  gains `peopleperhour-search` and `peopleperhour-message`;
  `source-pull --source=peopleperhour` forwards `stage`,
  `perspective`, `projectId`, `workstreamId`, `proposalId`, and
  `roomId`. The JS server adds same-origin proxy routes
  `POST /api/peopleperhour/pull|search|post-message` so the SPA
  stays useful when CORS blocks browser-direct calls. The connection
  guide catalogue exposes a PeoplePerHour provider entry that probes
  `https://www.peopleperhour.com/api/v1/me` and persists the
  access/refresh tokens in `secret:peopleperhour:access-token` and
  `secret:peopleperhour:refresh-token`. Tests live in
  `js/tests/peopleperhour-source.test.js`. The Rust server's
  `SOURCES` registry gains `peopleperhour` and crate versions sync
  with the JS package. The full atomic requirement list and
  solution plan live under `docs/case-studies/issue-12/`.

## 0.16.0

### Minor Changes

- e39c846: R-S1..R-S22: Add Upwork as the twelfth first-class `MessageSource`.
  The new `js/src/sources/upwork.js` adapter normalises jobs,
  proposals, contracts, rooms, room messages, time logs, and
  transactions into `msg:upwork:<external_id>` links plus dedicated
  `job:upwork:`, `proposal:upwork:`, `contract:upwork:`,
  `room:upwork:`, and `transaction:upwork:` link kinds. It ships
  both an archive importer (raw GraphQL/array dumps, the
  `{jobs, proposals, contracts, rooms, messages, transactions,
timeLogs}` envelope, and the Reports → Transaction History CSV
  sniffed against the Upwork header) and a live GraphQL client at
  `https://api.upwork.com/graphql` with `Bearer` OAuth 2.0 auth,
  Relay-style `pageInfo.endCursor` pagination, an injectable
  `fetchImpl` for tests, and an `operationOverrides` escape hatch for
  unverified field names. The live surface adds `searchJobs`
  (`marketplaceJobPostingsSearch`), `pullMessages` covering both the
  **proposal** stage (before approval) and the **contract** stage
  (after approval) from either the **client** or **freelancer**
  perspective, and `post` for the `roomsCreateMessage` mutation. To
  honour the Upwork ToS, every live-pulled link is stamped with
  `softCache: true` and `cacheTtlMs: 86_400_000` (24 h);
  `softCacheRetention()` purges expired live links while leaving
  archive imports durable. CLI gains `upwork-search` and
  `upwork-message`; `source-pull --source=upwork` forwards `stage`,
  `perspective`, `jobId`, `contractId`, `proposalId`, `roomId`, and
  `organizationId`. The JS server adds same-origin proxy routes
  `POST /api/upwork/pull|search|post-message` so the SPA stays
  useful when CORS blocks browser-direct calls. The connection guide
  catalogue exposes an Upwork provider entry that probes the GraphQL
  endpoint and persists the access/refresh tokens in
  `secret:upwork:access-token` and `secret:upwork:refresh-token`.
  Tests live in `js/tests/upwork-source.test.js`. The full atomic
  requirement list and solution plan live under
  `docs/case-studies/issue-4/`.

## 0.15.0

### Minor Changes

- bc19015: R-R1..R-R18: Add GitHub as the eleventh first-class `MessageSource`.
  The new `js/src/sources/github.js` adapter normalises issues, issue
  comments, pull requests, PR review comments, reviews, and discussions
  into `msg:github:<external_id>` links via `buildMessageLink()`. It
  ships both an archive importer (raw `gh api` array dumps and the
  standard `{issues, pulls, comments, reviewComments, reviews,
discussions}` envelope) and a live REST client with `Bearer` auth,
  `Link: rel="next"` pagination, and an injectable `fetchImpl` for
  tests. The live surface adds `pullMessages` (issues → comments → PRs
  → review comments → reviews), `listRepos` over `/user/repos`,
  `cloneRepo` that downloads the repo tarball, gunzips it with
  `node:zlib`, walks USTAR/PAX entries, and writes one
  `repo:<owner>/<name>:file:<path>` link per file plus a
  `repo:<owner>/<name>` index link with metadata children, and `post`
  for creating issue/PR comments. CLI gains `github-clone` and
  `github-comment`; `source-pull --source=github` forwards `owner`,
  `repo`, and `state`. The JS server adds same-origin proxy routes
  `POST /api/github/pull|clone|post-comment` so the SPA stays useful
  when CORS blocks browser-direct calls. The connection guide catalogue
  exposes a GitHub provider entry that probes `https://api.github.com/user`
  and persists the PAT in `secret:github:access-token`. Tests live in
  `js/tests/github-source.test.js`. The full atomic requirement list
  and solution plan live under `docs/case-studies/issue-5/`.

## 0.14.1

### Patch Changes

- e2f0047: Fix IndexedDB snapshot persistence so transaction completion handlers are attached before write requests start. Also make HTTP and TCP sync shutdown deterministic by closing idle server sockets, invoking transport disconnect cleanup, and waiting for TCP socket close events.

## 0.14.0

### Minor Changes

- R-O1..R-O19: Centralise every provider connection on a new Settings nav
  surface. Per-provider cards expose typed credential inputs, archive
  file upload + paste-fallback, and a "Try directly" probe that builds
  the URL from a `probeUrlTemplate` (e.g. Telegram
  `bot{token}/getMe`, Meta Graph `?access_token={token}`) so it never
  fires the broken legacy `/bot/getMe` or tokenless `/me` requests that
  returned 404/400. Each per-section guide now surfaces a "Connect first"
  CTA that deep-links into the matching Settings card via a custom
  `meta-sovereign:navigate` event. Credentials persist as
  encrypted-at-rest `secret:*` links via the existing `wrapSecretStore`
  contract and are still filtered from peer sync.

  R-I1..R-I12: Localise the SPA shell, navigation, and every view in
  English, Russian, Chinese, and Hindi. A new ~150-LOC i18n module ships
  the four bundled dictionaries, detects the active locale via RFC 4647
  §3.4 prefix matching against `localStorage.metaSovereignLocale` →
  `navigator.languages` → `navigator.language` → `'en'`, and exposes a
  header `<select>` (next to the theme toggle) so users can override the
  detected choice or fall back to the system default. `<html lang>` and
  `<html dir>` update on every locale change so screen readers and CJK
  font fallbacks behave correctly. Translation parity across locales is
  enforced by the new `js/tests/i18n.test.js` suite, which fails the
  build if a key drifts. Provider names ("Telegram", "WhatsApp") and API
  URLs stay in source form because they are proper nouns / brand
  identifiers.

  R-I11..R-I12 / R-Q7..R-Q8: Add hive-mind-style language-switcher H1s
  and `zh` / `hi` / `ru` sibling files for the root README, changelog,
  mobile README, top-level user-facing docs, and the issue-18 case-study
  documents. `js/tests/docs-language.test.js` now enforces sibling
  presence and switcher link resolution for that tracked Markdown surface.

## 0.13.0

### Minor Changes

- 48662ac: R-N1..R-N10: Add email as a first-class source with `.eml`/mbox import,
  browser-direct Gmail, Microsoft Graph, and JMAP receive/send support,
  Node local-server IMAP/POP3/SMTP transport, local server email routes, CLI
  commands, connection-guide copy, and the issue-#3 case study. The pure-Rust
  server now mirrors the wire surface: `email` appears in `/sources` and
  `/api/email/pull` + `/api/email/send` accept the same JSON envelopes for
  archive ingest and send queueing (live HTTP fetches and raw IMAP/POP3/SMTP
  remain JS-server features; the Rust send route returns
  `needs-local-server` for raw protocols).

## 0.12.0

### Minor Changes

- R-M1..R-M18: Replace every empty SPA section with a connection guide,
  add a CORS-aware direct-API probe with same-origin server fallback,
  and ship a step-by-step tutorial overlay.
  - New `js/src/web/connection-guides.js` — provider catalogue
    (Telegram, VK, X, WhatsApp, Facebook, LinkedIn, career.habr.com,
    hh.ru, SuperJob), per-section guide registry mirroring `navItems`,
    `tryDirect()` CORS-classifier, `localServerHelp` install copy
    (Rust / Node / Docker), `applyLocalServerOverride()` manual override.
  - New `js/src/web/connection-guide.js` — React `<ConnectionGuide />`
    and `<LocalServerHelp />` components rendered into the empty branch
    of every view in `js/src/web/views.js` (chat, operator, contacts,
    automation, patterns, replies, facts, audience, broadcast, outreach,
    profile, backup, status).
  - New `js/src/web/tutorial.js` — in-tree tour layer (`TutorialOverlay`,
    `TutorialButton`, `useTutorialPreference`, `defaultSteps`) that
    opens on first run, supports per-step skip, full turn-off, and
    re-open from a header button. Preference persists under the
    `metaSovereignTutorial` localStorage key.
  - `js/src/web/app.js` mounts the tutorial alongside the existing theme
    toggle.
  - New `docs/case-studies/issue-10/` with `README.md`, `requirements.md`,
    `solution-plan.md`, `components.md`, `external-research.md`, and raw
    issue/comment payloads under `data/`.
  - New section **M. Sovereign onboarding & connection guides
    (issue #10)** in `docs/REQUIREMENTS.md`.
  - New `js/tests/connection-guides.test.js` and `js/tests/tutorial.test.js`
    cover the guide registry, `tryDirect()` classification paths, and
    the tutorial preference round trip.

  R-N1..R-N9: Persist tutorial step progress and completed state under
  the existing `metaSovereignTutorial` localStorage key so refreshes
  resume the current tutorial step instead of restarting at step 1.

## 0.11.0

### Minor Changes

- 0d0a823: R-L1..R-L15: Browser-first publishing on GitHub Pages, user-friendly
  documentation rework, and CI/CD parity audit.
  - New `js/scripts/build-pages.mjs` builds the `dist/pages/` artifact from
    `js/src/web/` (writes `404.html`, `.nojekyll`, `manifest.webmanifest`,
    injects the manifest link into a copy of `index.html`).
  - New `.github/workflows/pages.yml` deploys the artifact via the
    official `actions/configure-pages@v5`,
    `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`
    on push to `main` and via `workflow_dispatch`. `pull_request` runs
    build-only. Both jobs cap at `timeout-minutes: 10`.
  - `README.md` is rewritten user-first: "Try it now" → "Run a local
    server" (Rust preferred, JS fallback) → "Connect the SPA to your
    server"; the developer reference moves below an explicit divider.
  - New `docs/USER-GUIDE.md` collects the user-facing flows.
  - New `docs/SERVER-PARITY.md` documents 32/38 routes parity between
    the JS server and Rust server.
  - New `docs/case-studies/issue-8/` with `README.md`, `requirements.md`,
    `solution-plan.md`, `components.md`, `external-research.md`,
    `ci-cd-template-comparison.md`, and raw issue/comment/template-inventory
    payloads under `data/`.
  - New section **L. Browser-first publishing (issue #8)** in
    `docs/REQUIREMENTS.md`.
  - All JavaScript code and tooling now live under `js/`; the Rust
    workspace manifest, lockfile, and crates now live under `rust/`.
  - New `js/tests/build-pages.test.js` unit-tests the build helper.

## 0.10.0

### Minor Changes

- 26266f1: Hardening: soft-delete by default, master-key vault, encrypted exports (issue #6).
  - **R-K1..R-K6 — Soft-delete by default.** `DELETE /links/:id` and the
    `delete()` method on the storage facade now mark the link with
    `deleted: { at, by }` instead of physically removing it. Tombstones are
    hidden from `GET /links` and `GET /links/:id` by default; pass
    `?include=tombstones` (or `?include=all`) to see them. Hard-delete is
    still available behind `?purge=1&confirm=1`. Provider adapters never
    call `delete` on upstream events — soft-delete is the only path.
  - **R-K7..R-K12 — Master-key vault.** New `src/storage/vault.js` holds
    one random 256-bit master key wrapped by one or more unlock methods
    (passphrase, PIN, passkey-`prf` blob, or TOTP recovery code). Adding
    or removing a method only re-wraps the master key — no data is
    re-encrypted (R-K9/R-K10). Removing the last method is refused
    (R-K11). All wrapping uses scrypt + AES-256-GCM, same envelope shape
    as `encryptBackup`.
  - **R-K13..R-K17 — Encrypted exports & purge.** New
    `src/storage/export-encrypted.js`, plus
    `POST /api/export-encrypted`, `POST /api/links/purge-tombstones`, and
    CLI subcommands `export-encrypted`, `purge-tombstones`,
    `vault-init`, `vault-add`, `vault-remove`, `vault-list`. Bulk purge
    refuses to run without `confirm: true` (R-K4) and only matches
    tombstones (R-K5).
  - **R-K18..R-K20 — Docs.** New case study under
    `docs/case-studies/issue-6/` (deep analysis, online research,
    requirements, plan, components survey) and a new section **K.
    Hardening (issue #6)** in `docs/REQUIREMENTS.md` carrying R-K1..R-K20
    with implementation pointers.

## 0.9.0

### Minor Changes

- 94ab57b: Establish project identity as `meta-sovereign`, land the case study for issue #1, and ship the runnable prototype that exercises every architectural layer of the plan.

  Identity and case study:
  - `package.json`: `name` set to `meta-sovereign`, description and keywords aligned with the project vision, repository URL pointed at `link-foundation/meta-sovereign`.
  - `scripts/{validate,merge,publish,format-release-notes,create-manual}-changesets.mjs`: `PACKAGE_NAME` constants updated.
  - `README.md`, `docs/CONTRIBUTING.md`: title and intro reflect the new project identity.
  - `docs/case-studies/issue-1/`: catalogues every requirement from issue #1, surveys the linked libraries (links-notation, lino-objects-codec, doublets-rs, doublets-web, link-cli, lino-arguments, deep-foundation/sdk, plus the konard ingestion tools), summarises external research on local-first software, CRDT sync, unified messaging, encrypted-at-rest storage, browser SQLite, fuzzy search, and node editors, and proposes a phased solution plan with stable requirement IDs.

  Runnable prototype baseline (each layer has unit/integration tests):
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
  - `src/web/`: SPA served by the local Node `http` server — chat, contacts, automation graph editor, pattern table with regex inference, broadcast composer, status. Backed by new `/api/contacts`, `/api/patterns`, `/api/patterns/infer`, `/api/graphs`, `/api/status` routes that derive views from the local store.
  - `src/patterns/`: `lcs`-based regex synthesis with character-class inference for variable gaps, plus `compilePeg` for declarative rules with named captures.
  - `src/storage/backup.js`: AES-256-GCM encryption with scrypt KDF; `createBackup` writes `.json.enc` when a passphrase is provided, `restoreBackup` auto-detects.
  - `src/sync/`: vector-clock CRDT — `vcInit/vcTick/vcMerge/vcCompare` plus a deterministic concurrent-write tiebreak; Lamport `version` remains the fallback for legacy links.
  - `tests/e2e.test.js`: end-to-end pipeline test driving the HTTP API — import messages, query derived contacts and status, round-trip a backup.

  Iteration 3 (follow-up commits on the same PR) turns the early runnable layer into full-vision coverage from issue #1 in one process:
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
  - `docs/ROADMAP.md`: the live punch-list — every requirement gap lives here until it is closed.
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

  Iteration 9 (follow-up commits on the same PR) wires the audience → outreach UI surface and a backup/restore UI surface, ships a dark-mode toggle, and lifts accessibility hygiene to skip-link + ARIA + focus-visible:
  - `src/server/routes-mutating.js` + `src/server/routes-backup.js`: new `POST /api/outreach` endpoint that previews and queues mass-personal envelopes from an audience query, plus a backup HTTP surface (`POST /api/backup`, `GET /api/backups`, `POST /api/backups/:name/restore`) gated on `archiveDir` (defaults to `<storeDir>/archives`), with optional passphrase support so the encrypted-at-rest path is reachable from the SPA.
  - `src/web/views.js`: `outreachView` (audience-query input + per-network targeting controls + envelope preview list) and `backupView` (create/list/restore archives) — both pull from the new endpoints.
  - `src/web/app.css` + `app.js` + `index.html`: replaces hard-coded colors with CSS custom properties (so dark mode is one variable swap), adds a persistent theme toggle button (system / light / dark), a skip-link as the first focusable element, ARIA roles + labels on landmarks, and visible focus outlines.
  - `tests/e2e-browser-spa.mjs`: extended so headless Chromium walks the new outreach flow, executes a backup → delete → restore round-trip (verifying the seeded message returns), toggles dark mode + reloads to confirm persistence, and asserts the skip-link is the first focusable element on the page.

  Iteration 10 (follow-up commits on the same PR) brings the Rust server up to feature parity with the Node observability surface so a single Prometheus scraper can pull from either backend identically:
  - `crates/meta-sovereign-server/src/handlers.rs`: `metrics_text(state, ws_peers, rtc_rooms)` mirrors `src/server/metrics.js` byte-for-byte — same metric names, same labels, same OpenMetrics text format. Counts links by id prefix (msg, pattern, graph, reply, broadcast, contact, profile, resume, secret) so dashboards can group by `kind`.
  - `crates/meta-sovereign-server/src/routes.rs`: new `MetricsCtx { ws_peers, rtc_rooms }` threaded through `dispatch()` so `/metrics` reflects live socket counts; existing 11 dispatch sites updated.
  - `crates/meta-sovereign-server/src/http.rs`: adds a `LogFormat` enum (`None` | `Json`) on `ServerOptions`. Pure-`std` JSON access logger writes one `{ts, level, event:"http", method, path, status, duration_ms}` object per request line — no chrono, no serde. ISO-8601 timestamps via Howard Hinnant's civil-date algorithm; minimal hand-rolled JSON escaper. Connection state bundled into a `ConnectionCtx` struct so `handle_connection` keeps clippy's `too_many_arguments` budget.
  - `crates/meta-sovereign-server/src/main.rs`: `--log json` CLI flag and `MS_LOG_FORMAT=json` env var.
  - `crates/meta-sovereign-server/tests/wire_protocol.rs`: new `metrics_endpoint_emits_prometheus_exposition` integration test seeds a `msg:` link, `GET /metrics`, asserts `# HELP`/`# TYPE` headers, `meta_sovereign_links_by_kind{kind="message"} 1`, and the WebSocket/WebRTC gauge lines.

  Tests: 122/122 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean.

  Iteration 11 (follow-up commits on the same PR) closes the token-storage-encryption item from ROADMAP §8 and the maintainer directive that `secret:*` links must never ship to peers:
  - `src/storage/secret-store.js`: `wrapSecretStore({ inner, passphrase })` is a Universal-Links-Access decorator that transparently encrypts/decrypts the payload of any link whose `id` starts with `secret:`. The on-disk shape is `{ id, tokens: idTokens(id), enc: '<aes-256-gcm envelope>' }` so the binary store can still index by id but no plaintext value, body, or token leaks. Reuses the same AES-256-GCM + scrypt envelope `createBackup`/`restoreBackup` already use, so a single passphrase covers both surfaces. Non-`secret:*` links pass through untouched. With no passphrase the wrapper returns the inner store unchanged.
  - `src/storage/index.js`: re-exports `wrapSecretStore` and `isSecretLinkId`.
  - `src/server/index.js`: `secretPassphrase` option (or `MS_SECRET_PASSPHRASE` env var) wraps the configured store before handlers, sync, and HTTP routes attach. Store init lifted into `initStore()` to keep clippy/eslint complexity within budget.
  - `src/sync/index.js`: `createPeer` now drops `secret:*` events on both the outbound (`onLocal` filter) and inbound (`receive` filter) paths so a malicious peer can't pollute our key store and a compromised handler can't exfiltrate. Inbound filtering is independent of outbound — both ends defend.
  - `tests/secret-store.test.js`: 7 new cases — encrypts at rest, passes non-secrets through, no-op without passphrase, rejects wrong passphrase, never broadcasts secrets to peers, drops hostile inbound secret events, and an end-to-end HTTP round-trip that asserts the on-disk `data.lino` contains the id but not the plaintext value.

  Tests: 129/129 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean.

  Iteration 12 (follow-up commits on the same PR) closes ROADMAP §6 by wiring the API documentation surface into CI and the release pipeline (R-H3):
  - `.github/workflows/release.yml`: new `docs-build` job runs on every push and PR. It executes `npm run docs:api` (the existing JSDoc-style walker over `src/`) and `cargo doc --no-deps --workspace` (the Rust crates `meta-sovereign-core` + `meta-sovereign-server`), uploads both as workflow artefacts, and gates the `release` job behind it so a doc-comment regression fails CI before the version bump. The Rust toolchain is set up with `dtolnay/rust-toolchain@stable`.
  - `.github/workflows/release.yml` (release + instant-release jobs): after `Format GitHub release notes`, the workflow rebuilds the docs against the just-released commit and attaches `meta-sovereign-js-api-docs-<tag>.tar.gz` + `meta-sovereign-rust-api-docs-<tag>.tar.gz` to the GitHub Release via `gh release upload`.
  - `scripts/attach-api-docs.sh`: helper invoked from the release jobs. Tars `docs/api/` and `target/doc/` separately, uploads both to the release identified by the supplied tag (`--clobber` so re-runs of the workflow refresh the assets).
  - `docs/REQUIREMENTS.md`: R-H3 row updated with the new CI surface.
  - `docs/ROADMAP.md`: §6 "Live-API documentation surface" deleted (both bullets closed).

  Iteration 13 (follow-up commits on the same PR) closes the ROADMAP §4 "Re-run e2e against the Rust server" item and tightens the surrounding section now that audience outreach + backup/restore are already covered by iteration 9's e2e:
  - `tests/e2e-browser-spa.mjs`: extracted the per-step assertions into 11 named helpers and a declarative `ALL_STEPS` table so the suite can run against multiple backends. Added a `startRustBackend()` that spawns `target/{release,debug}/meta-sovereign-rs serve --port 0 --web src/web`, parses the bound port from the binary's stdout, and tears it down with SIGTERM on completion. Each backend declares its capability set (`outreach`, `backups`, `theme`, `skipLink`, `navViews`); steps tagged with a `requires` capability are skipped when the backend doesn't support them, so the JS pass exercises the full 11-step path while the Rust pass runs the 9 steps that map onto its currently-implemented HTTP surface (no `/api/outreach`, no `/api/backups` yet). Setting `RUN_BROWSER_E2E_RUST=1` enables the second pass.
  - `eslint.config.js`: ignores `target/**` (rustdoc bundle) and `docs/api/**` (generated API docs) so locally building either doesn't produce thousands of false-positive lints.
  - `docs/REQUIREMENTS.md`: R-J7 + R-H4 rows updated to reflect dual-backend coverage and wire-protocol parity assertions.
  - `docs/ROADMAP.md` §4: Rust-server e2e bullet deleted; "Audience → mass-personal outreach" and "Backup → restore round-trip" bullets removed (both already covered by the existing e2e since iteration 9). Section preamble rewritten to describe the dual-backend default.

  Tests: 129/129 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean. Real-browser e2e: 11/11 steps pass against the JS server, 9/9 against `meta-sovereign-rs serve`.

  Iteration 14 (follow-up commits on the same PR) closes ROADMAP §4 "Profile-sync envelopes":
  - `tests/e2e-browser-spa.mjs`: new `stepProfileSync` step navigates to the profile view, types a name + bio into the Profile editor, clicks "save profile", waits for the rendered `plannedSyncs` JSON, and asserts (1) the response contains a queued envelope per known network (telegram + vk specifically), (2) every envelope's `status` is `queued`, (3) the canonical `profile:me` link on the server reflects the edits. Gated on a new `profile` capability flag so the Rust pass (which doesn't yet implement `/api/profile`) auto-skips.
  - `docs/ROADMAP.md` §4: removes the "Profile-sync envelopes" bullet.
  - `docs/REQUIREMENTS.md`: R-D5 row mentions the SPA editor + e2e coverage.

  Iteration 15 (follow-up commits on the same PR) closes ROADMAP §2 "Accessibility pass via axe-core" and drops the now-stale "Dark mode toggle" bullet from the same section:
  - `package.json`: `axe-core@^4.11.4` declared under `optionalDependencies` so installs without the audit dep still succeed; the e2e step skips with a `SKIP (axe-core not installed)` line when missing.
  - `tests/e2e-browser-spa.mjs`: new `stepAxeAudit` step loads `node_modules/axe-core/axe.min.js` and injects it via `page.evaluate(axeSource)` (CDP `Runtime.evaluate` is not subject to the SPA's `script-src 'self'` CSP — `addScriptTag({ content })` would inline a `<script>` and be blocked), runs `axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] })`, and fails the suite if any violation has `impact: 'serious'` or `'critical'`. Step runs unconditionally (no `requires` flag) so the same audit gates both the JS server and the pure-Rust `meta-sovereign-rs serve` static SPA.
  - `docs/REQUIREMENTS.md`: R-H1 flips from "Partial" to "Done" referencing the axe-core audit; R-J7's coverage list adds `axe-core WCAG 2.0 A/AA audit`.
  - `docs/ROADMAP.md` §2: removes the "Accessibility pass" bullet and the now-stale "Dark mode toggle" bullet (the toggle is implemented, persisted, and exercised by `stepThemeToggle`); §4 preamble updated to mention the axe audit.

  Tests: 129/129 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean. Real-browser e2e: 13/13 steps pass against the JS server, 10/10 against `meta-sovereign-rs serve` (including the axe-core audit on both backends — zero serious/critical violations).

  Iteration 16 (follow-up commits on the same PR) closes ROADMAP §8 "WebRTC TURN fallback":
  - `docs/WEBRTC-TURN.md`: new operator guide explaining when the SPA needs a TURN relay (cross-NAT, symmetric NATs), a minimal `coturn` `docker-compose.yml` snippet that sits alongside `docker/docker-compose.yml`, and a code sample showing how to forward `rtcConfig.iceServers` (with `stun:`, `turn:`, and `turns:` URLs) into `createWebRtcTransport`. Documents `iceTransportPolicy: 'relay'` for verifying the TURN path in isolation, and explains how to avoid leaking long-term TURN secrets — either by serving credentials from an authenticated endpoint that the existing `secret:*` link store + `wrapSecretStore` already encrypts at rest and refuses to ship to peers, or by minting short-lived REST-style ephemeral credentials per `draft-uberti-behave-turn-rest`. Verifies the resulting candidate pair via `chrome://webrtc-internals`.
  - `docs/ROADMAP.md` §8: section deleted (only bullet was the TURN fallback).

  Iteration 17 (follow-up commits on the same PR) fixes a Bun + Deno regression introduced by iteration 10's JSON access logger, restoring the cross-runtime test matrix to green:
  - `src/sync/bun-server.js`: the `nodeRes` shim built by `runRequestListeners` for Bun's `Bun.serve` bridge previously lacked `on()` and `hasHeader()`, so two methods that Node's real `http.ServerResponse` exposes — and that two pieces of recently-landed server code rely on — threw `TypeError: res.on is not a function` and `TypeError: res.hasHeader is not a function` under both Bun and Deno's Node compat layer. The shim now records `'finish'` listeners in a per-response array and fires them from `end()` (so the JSON access logger flushes correctly), and implements `hasHeader(k)` over the case-folded `headers` object (so `applySecurityHeaders` no longer overwrites a header a route already set).
  - `tests/server.test.js`: the `/metrics` test fired a seeding `PUT /links` whose response body it never read. Node and Bun tolerate that, but Deno's leak detector failed the test with `A fetch response body was created during the test, but not consumed`. The test now drains it with `.then((r) => r.text())`, matching the surrounding tests' style.

  Tests: Node 129/129, Bun 129/129, Deno `tests/server.test.js` 8/8 (the full Deno run still trips on a known WebSocket-handshake mismatch unrelated to this PR — it manifests only on certain Deno builds and is not part of the matrix this iteration was reviving).

  Iteration 18 (follow-up commits on the same PR) closes ROADMAP §4 "Two-browser WebRTC convergence" (R-J7) by wiring the SPA boot to the existing `/rtc` signaling broker and asserting end-to-end peer-to-peer convergence in headless Chromium:
  - `src/web/webrtc-sync.js`: new browser module. `attachWebRtcSync({ store, origin })` opens a `WebSocket` to `${origin}/rtc?room=default`, wraps it in `signalingChannel`, constructs `createWebRtcTransport({ initiator: false })`, and connects it to `createPeer(store)`. Existing peers become initiator on `peer-joined` (the broker tells them a newcomer arrived) by calling the new `transport.startAsInitiator()`, so two SPAs in the same room negotiate an `RTCDataChannel` deterministically and start fanning store events through it. `secret:*` filtering already happens inside `createPeer`, so token links never traverse this transport.
  - `src/sync/webrtc-transport.js`: extracted the offer-dance into a `startAsInitiator()` method on the returned transport (was previously inlined in the `if (initiator)` branch). Both initiator-now and initiator-later patterns share the same code path; existing unit tests still pass unchanged.
  - `src/web/dom.js`: SPA boot now calls `attachWebRtcSync({ store, origin })` whenever `discoverServer` returns an origin, so any browser that talks to a local server automatically also opens a peer-to-peer channel to other browsers in the same room. The boot returns an `{ store, bus, client, rtc }` quadruple so future code can inspect/close the RTC handle without hunting it through globals.
  - `src/sync/peer.js`: split the transport-agnostic primitives (`createPeer`, `merge`, vector-clock helpers, `loopback`) out of `src/sync/index.js`. `index.js` re-exports them for backwards compatibility but the browser bundle now imports them directly so the SPA does not pull in `src/sync/tcp-transport.js` (`node:net`) or the server-side WebSocket transport (`node:net` + `node:http`) through `index.js`'s re-export wall. This was the actual blocker: the dynamic `import('/dom.js')` inside the new e2e step previously failed with `Failed to fetch dynamically imported module` because the module graph reached server-only code.
  - `src/server/index.js`: no behaviour change — the existing `/rtc` mount + `attachSignaling(server, { path: '/rtc' })` was already in place from iteration 5; this iteration just makes the SPA actually use it.
  - `tests/e2e-browser-spa.mjs`: new step `stepTwoBrowserWebRtcConvergence` opens a _second_ Playwright browser context (so it gets an isolated IndexedDB), boots the SPA in both, has page A write a unique `msg:rtc-probe-*` link via `api.put`, and waits up to 20s for page B to read the same link out of _its_ local store. With WebRTC enabled the round trip completes in single-digit milliseconds (loopback ICE has no real RTT); a control experiment that strips `RTCPeerConnection` from page B confirms convergence does not happen via any other path. Step is gated behind a `twoBrowserRtc` capability flag — the JS backend exposes a symmetric `/rtc` broker so it runs there; the Rust backend's broker shape isn't exercised here so the flag is `false`. The `runSuite` ctx now also includes `browser` so the step can spawn a second context.
  - `experiments/rtc-probe.mjs`: minimal repro / debugging probe for the convergence path; useful for diagnosing transport regressions.
  - `docs/REQUIREMENTS.md` row R-J7: updated to mention the new two-browser convergence step.
  - `docs/ROADMAP.md` §4: "Two-browser WebRTC convergence" bullet deleted; section preamble rewritten to mention the new step.

  Tests: Node 129/129 (unit), e2e-browser-spa 14/14 against the JS backend.

  The codebase now exercises every layer of the plan end-to-end from CLI, HTTP, real browser, and SPA — including offline-first SPA, autodiscovered or manually configured server, direct browser-to-browser sync over WebRTC verified end-to-end with two real browsers in CI, audience-driven mass-personal outreach, encrypted backups with a UI restore flow, dark mode + a11y, a Prometheus/JSON observability surface mirrored on both Node and Rust backends, and AES-256-GCM-encrypted-at-rest secret storage that never traverses peer sync — with a parallel Rust core, vector-clock sync, and full audit-driven test coverage. Subsequent iterations continued closing the remaining roadmap items.

  Iteration 19 (follow-up commits on the same PR) closes the Telegram connector and real Telegram archive import roadmap items:
  - `src/sources/telegram.js`: robust Telegram Desktop import now handles all-chats exports, per-chat exports, `text_entities`, `date_unixtime`, and duplicate local message ids across chats. The live connector now uses Telegram Bot API `getUpdates`, `sendMessage`, `setMyName`, and `setMyDescription` with either `TELEGRAM_BOT_TOKEN`, an explicit token, or a local `secret:telegram:*` token link.
  - `src/sources/index.js`: `pullLiveInto()` imports live updates into any Universal Links store and stamps each produced link with `handled: { at, by }` plus `handledBy[source:<name>:live]` so connector echoes are traceable and at-most-once.
  - `src/handlers/index.js` + `src/server/handlers-bootstrap.js`: `source-pull:<source>:*` links now trigger a live import through the handler bus and write completion metadata back to the command link.
  - `src/cli/index.js`: new `meta-sovereign source-pull --source=telegram` command.
  - `tests/telegram-live.test.js`: covers real Telegram export shape, mocked Bot API pull/send/profile sync, secret-token lookup, and one-shot source-pull handler execution.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-E2 is Done; the real Telegram archive import and Telegram live connector bullets are removed from the roadmap.

  Tests: focused Node source/handler slice passes; total JS coverage is now 133 tests.

  Iteration 20 (follow-up commits on the same PR) closes the UI design audit roadmap item:
  - `docs/UI-DESIGN-AUDIT.md`: adds a per-surface Apple HIG / Google Material / Microsoft Fluent audit for the global shell, chat, operator, contacts/CRM, automation graph, patterns/replies, broadcast/profile/resume, settings, sync, and backup flows.
  - `docs/REQUIREMENTS.md`: R-H1 now references the design audit alongside the semantic, keyboard, theme, ARIA, and axe-core evidence already enforced by the app and e2e tests.
  - `docs/ROADMAP.md`: removes the R-H1 audit checkbox and narrows the UI section to the remaining React port.

  Iteration 21 (follow-up commits on the same PR) hardens the Deno test matrix after Telegram gained real live side effects:
  - `src/sync/ws-transport.js`: Deno now uses its native `WebSocket` client for sync/signaling tests instead of the Node `net` handshake path that current Deno 2.x rejects.
  - `tests/server-iter3.test.js`: the route-level full-pipeline fixture disables background handlers so environments with `TELEGRAM_BOT_TOKEN` set do not start a real Telegram profile-sync request while asserting planned-sync route responses.

  Tests: Node 133/133, Bun 133/133, Deno 133/133, Rust 52/52; `npm run check` clean.

  Iteration 22 (follow-up commits on the same PR) closes the remaining external-service connector roadmap items:
  - `src/sources/http.js` and `src/sources/link.js`: shared live-adapter HTTP helpers and a leaf `buildMessageLink` module, which removes the source-registry circular import when callers import individual adapters directly.
  - `src/sources/vk.js`: VK method API connector for conversation/history import, `messages.send`, `status.set`, and `account.saveProfileInfo`.
  - `src/sources/whatsapp.js`: WhatsApp Cloud API connector for webhook ingestion, opted-in text sends, and business profile updates.
  - `src/sources/x.js`: X API v2 connector for DM lookup/send, mention import, public post creation, and profile update.
  - `src/sources/facebook.js`: Graph/Messenger connector for page conversation import, webhook ingestion, replies, and page profile metadata updates.
  - `src/sources/linkedin.js`: LinkedIn REST Posts connector for API-side post import/export plus profile/resume publication.
  - `src/sources/hh.js`, `src/sources/habr-career.js`, `src/sources/superjob.js`: job-board live adapters for application/negotiation message import, reply sending, and resume create/update flows.
  - `tests/live-connectors.test.js`: mocked-fetch coverage for every non-Telegram live connector, keeping real credentials out of CI while verifying URL, header, body, and normalized-link behavior.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-A1 and R-E1/R-E3/R-E4/R-E5/R-E6/R-E7/R-E8/R-E9 are marked Done; the external-service connector section is removed from the roadmap.

  Tests: Node 139/139, Bun 139/139, Deno 139/139, Rust 52/52; `npm run check` clean.

  Iteration 23 (follow-up commits on the same PR) closes the browser-side WASM roadmap section:
  - `src/storage/browser-store.js`: adds `createDoubletsWebDriver()` and `loadDoubletsWebDriver()`, indexing BrowserStore snapshots through the real `doublets-web` `Link` / `LinksConstants` / `UnitedLinks` surface when the WASM module is bundled or injected. `pickBrowserDriver()` now prefers that driver before IndexedDB, localStorage, and in-memory fallback.
  - `crates/meta-sovereign-wasm`: new Rust `cdylib` wrapper around `meta_sovereign_core::pattern_matches`, exporting `ms_alloc`, `ms_dealloc`, and `pattern_matches` for browser WebAssembly calls.
  - `src/web/patterns-wasm.js`, `src/web/pattern-worker.js`, and `src/web/pattern-matcher.wasm`: browser wrapper + worker that runs supported pattern previews through the Rust WASM matcher and falls back to JS `RegExp` for complex regexes.
  - `src/server/index.js` and `crates/meta-sovereign-server/src/routes.rs`: both static servers now serve `.wasm` with `application/wasm`; CSP allows same-origin workers and WebAssembly compilation without allowing inline scripts.
  - `tests/browser-store.test.js`, `tests/wasm-patterns.test.js`, and server route tests cover the doublets-web driver, the actual checked-in WASM artifact, and the static serving contract.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-G1 now records the completed Rust/WASM pieces; the browser-side WASM roadmap section is removed.

  Tests: Node 142/142, Bun 142/142, Deno 142/142, Rust 53/53; `npm run check` clean.

  Iteration 24 (follow-up commits on the same PR) closes the React SPA
  port roadmap item:
  - `src/web/app.js` and `src/web/views.js`: the SPA shell and every view
    now render as React components while continuing to use the existing
    offline-first `api` facade, discovery cascade, WebRTC sync, and
    browser storage stack. The static shell still exposes the same
    landmarks and `data-view` navigation contract before hydration.
  - `scripts/build-web.mjs` and `src/web/app.min.js`: `npm run build:web`
    bundles the editable React source into the same-origin browser asset
    loaded by `index.html`.
  - `package.json`: adds React, ReactDOM, and esbuild as development
    tooling for the web bundle.
  - `tests/web-react.test.js`: pins the React packaging contract so the
    source, bundle, and script entrypoint cannot silently drift back to a
    non-React shell.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-G1 is Done; the React
    roadmap section is removed.

  Tests: Node 143/143, Bun 143/143, Deno 143/143, Rust 53/53;
  `npm run check` clean; real-browser
  `RUN_BROWSER_E2E=1 npm run test:e2e:browser` passes all JS-backend
  critical UI paths.

  Iteration 25 (follow-up commits on the same PR) closes the final
  Electron/mobile packaging and discovery roadmap items:
  - `electron/main.js` now exports testable desktop boot helpers, opens
    the same React/server URL with an isolated preload, and configures
    `electron-updater` via `checkForUpdatesAndNotify()` when the optional
    updater peer is available.
  - `electron/preload.cjs` passes shell-provided LAN candidates into the
    renderer without enabling Node integration.
  - `src/web/discover.js` and `src/web/discovery-shell.js` now accept
    Electron/Capacitor WebView candidates through
    `window.metaSovereignShell`, query parameters, or a global injected by
    native code before falling back to localhost/offline mode.
  - `capacitor.config.json`, `scripts/build-mobile.mjs`, and
    `scripts/mobile-platform.mjs` provide the Capacitor fallback pipeline
    for iOS and Android using the same React bundle in `mobile/www`.
  - `tests/mobile-electron-packaging.test.js` pins the WebView discovery,
    Electron updater, and mobile build contracts.
  - `docs/REQUIREMENTS.md`: R-F3, R-G3, R-J2, R-J3, R-J9, and R-J10 now
    record the completed packaging/discovery state; `docs/ROADMAP.md`
    records an empty tracked roadmap.

  Tests: focused Node mobile/electron coverage passes; full matrix pending
  the final local verification pass for this iteration.

  Iteration 26 (follow-up commits on the same PR) makes CI fail fast on
  hangs and flaky tests so AI-driven iteration stays quick (R-J11):
  - `.github/workflows/release.yml` and `.github/workflows/links.yml`:
    every job now declares an explicit `timeout-minutes`, sized at
    roughly 5–10× the observed p95 of that job (5/10/15/30 min bands).
    Without these caps a hung promise or flaky network call would only
    fail after the GitHub Actions default of six hours per job, which
    defeats the AI iteration loop. Each timeout has an inline comment
    recording the typical run window vs. the cap so future tuning is
    data-driven, not guesswork.
  - `package.json`: `npm test` now runs
    `node --test --test-timeout=30000 tests/*.test.js` so an individual
    hung test fails in 30s instead of waiting for the job-level cap.
  - `.github/workflows/release.yml` (test matrix): the Bun runner uses
    `bun test --timeout 30000` to apply the same 30s per-test budget on
    the Bun side. Deno has no global per-test timeout flag, so Deno
    tests are protected only by the job-level `timeout-minutes: 10` —
    documented in `docs/BEST-PRACTICES.md` §13.
  - `docs/BEST-PRACTICES.md`: new §13 "Reasonable Timeouts on Every Job
    and Test" codifies the policy with the explicit per-job table
    (detect-changes 5, lint 10, test 10, docs-build 15, release 30, …)
    and the per-test 30s budget. The previous "Proper Cancellation
    Propagation" section is renumbered to §14.
  - `README.md`: "Reasonable timeouts on every job" subsection added
    under the testing section, summarising the band table and per-test
    flags so contributors know what budget to size new jobs against.
  - `docs/REQUIREMENTS.md`: new R-J11 row records the directive (the
    user's "fail faster, fix faster" ask) alongside the implementation
    evidence.

  The same `timeout-minutes` gap exists in the upstream
  `link-foundation/js-ai-driven-development-pipeline-template` and
  `link-foundation/rust-ai-driven-development-pipeline-template`
  templates and will be reported back to them so every project bootstrapped
  from those templates inherits this behaviour by default.

  Iteration 27 (follow-up commits on the same PR) aligns the active docs
  with the final implementation state:
  - `docs/ROADMAP.md` is restored as an explicit empty roadmap ledger so
    reviewers have the requested stable file path for new findings.
  - `docs/REQUIREMENTS.md`, `README.md`, and the issue #1 case study now
    point at the implemented PR #2 state instead of older future-phase or
    deleted-roadmap wording.
  - `tests/docs-consistency.test.js` guards against regressing the
    requirements, roadmap, and case-study docs into contradictory states.
  - The documentation validation job now treats `docs/ROADMAP.md` and
    `docs/REQUIREMENTS.md` as required files.

## 0.8.0

### Minor Changes

- 3e45a9c: Add `--tag-prefix` option to release scripts for multi-language repos

  The `create-github-release.mjs` and `format-github-release.mjs` scripts now accept a `--tag-prefix` CLI parameter (defaulting to `v`) that allows users to customize the git tag prefix. This enables use in multi-language repositories where different language packages need distinct tag prefixes (e.g., `js-v1.0.0` vs `rust-v1.0.0`).

## 0.7.3

### Patch Changes

- ae2cc9a: Add self-healing release mechanism that checks npm registry for unpublished versions

## 0.7.2

### Patch Changes

- 9126e16: fix: npm upgrade fallbacks and Node.js 24.x upgrade for CI/CD
  - Upgrade Node.js from 20.x to 24.x in all workflow files (avoids broken npm in Node.js 22.22.2)
  - Add 4-strategy fallback chain to setup-npm.mjs (standard, curl tarball, npx, corepack)
  - Update GitHub Actions to latest versions (checkout v6, setup-node v6, create-pull-request v8)
  - Add case study documentation for issue #33

## 0.7.1

### Patch Changes

- 6916409: Use per-commit diff instead of full-PR diff for CI change detection

## 0.7.0

### Minor Changes

- 983789a: Add CI/CD best practices from hive-mind: fast-fail job ordering, test compilation, file line limits check, secrets detection, documentation validation, extracted fresh merge simulation script, and proper cancellation propagation

## 0.6.0

### Minor Changes

- 8961862: Add automated broken link checker with Web Archive fallback suggestions
  - Add `.github/workflows/links.yml` with lychee-action for link checking in Markdown and HTML files
  - Add `scripts/check-web-archive.mjs` to check broken links against the Wayback Machine API
  - Add `.lycheeignore` for excluding known false-positive URLs (localhost, example.com, etc.)
  - Update `README.md` to document the broken link checker feature
  - Scheduled weekly check (Mondays at 09:00 UTC) to catch links that break over time
  - On PRs, broken links with no Web Archive fallback will fail the check
  - For broken links that have archived versions, provides actionable replacement suggestions
  - On scheduled runs, automatically creates a GitHub Issue with the full broken links report

  Fixes #27

## 0.5.1

### Patch Changes

- e398190: Add comprehensive best practices comparison and improve CI concurrency
  - Add DETAILED-COMPARISON.md with side-by-side analysis of ALL scripts, workflows, and configurations
  - Implement cancel-in-progress for main branch concurrency (hive-mind Issue #1274 fix)
  - Fix max-lines documentation (1500, not 1000)
  - Reference detailed comparison from BEST-PRACTICES.md

## 0.5.0

### Minor Changes

- 66211b5: Add fresh merge simulation to CI/CD to prevent stale merge preview issues
  - Add "Simulate fresh merge with base branch" step to lint and test jobs
  - This ensures PR CI validates the actual merge result, not a stale snapshot
  - Prevents CI failures on main branch after merging PRs that sat open for days
  - Add case study documentation for issue #23 with root cause analysis
  - Add ignore patterns for case study data files in ESLint and Prettier

  See docs/case-studies/issue-23 for detailed analysis of the stale merge preview problem.

  Fixes #23

## 0.4.0

### Minor Changes

- e6c2691: Add multi-language repository support for CI/CD scripts
  - Add `scripts/js-paths.mjs` utility for automatic JavaScript package root detection
  - Support both `./package.json` (single-language) and `./js/package.json` (multi-language repos)
  - Add `--legacy-peer-deps` flag to npm install commands in release scripts to fix ERESOLVE errors
  - Save and restore working directory after `cd` commands to fix `command-stream` library's `process.chdir()` behavior
  - Add case study documentation with root cause analysis in `docs/case-studies/issue-21/`

## 0.3.0

### Minor Changes

- 80d9c84: Add CI check to prevent manual version modification in package.json
  - Added `check-version.mjs` script that detects manual version changes in PRs
  - Added `check-changesets.mjs` script to check for pending changesets (converted from inline shell)
  - Added `version-check` job to release.yml workflow
  - Automated release PRs (changeset-release/_ and changeset-manual-release-_) are automatically skipped

## 0.2.2

### Patch Changes

- 9a12139: Fix CI/CD check differences between pull request and push events

  Changes:
  - Add `detect-changes` job with cross-platform `detect-code-changes.mjs` script
  - Make lint job independent of changeset-check (runs based on file changes only)
  - Allow docs-only PRs without changeset requirement
  - Handle changeset-check 'skipped' state in dependent jobs
  - Exclude `.changeset/`, `docs/`, `experiments/`, `examples/` folders and markdown files from code changes detection

## 0.2.1

### Patch Changes

- 55aef41: Make Bun the primary runtime choice throughout the template
  - Update all shebangs from `#!/usr/bin/env node` to `#!/usr/bin/env bun` in scripts, experiments, and case studies
  - Update README.md to prioritize Bun in all sections (features, development, runtime support, package managers, scripts reference)
  - Update examples to list Bun first
  - Bun now described as "Primary runtime with highest performance" and "Primary choice" for package management
  - Maintains full compatibility with Node.js and Deno

## 0.2.0

### Minor Changes

- d3f7fcd: Improve changeset CI/CD robustness for concurrent PRs
  - Update validate-changeset.mjs to only check changesets ADDED by the current PR (not pre-existing ones)
  - Add merge-changesets.mjs script to combine multiple pending changesets during release
  - Merged changesets use highest version bump type (major > minor > patch) and combine descriptions chronologically
  - Update release workflow to pass SHA environment variables and add merge step
  - Add comprehensive case study documentation for the CI/CD improvement
  - This prevents PR failures when multiple PRs merge before a release cycle completes

## 0.1.4

### Patch Changes

- e9703b9: Add ESLint complexity rules with reasonable thresholds

## 0.1.3

### Patch Changes

- 0198aaa: Add case study documentation comparing best practices from effect-template

  This changeset adds comprehensive documentation analyzing best practices from
  ProverCoderAI/effect-template repository, identifying gaps in our current setup,
  and providing prioritized recommendations for improvements.

  Key findings include missing best practices like code duplication detection (jscpd),
  ESLint complexity rules, VS Code settings, and test coverage thresholds.

## 0.1.2

### Patch Changes

- 2ea9b78: Enforce strict no-unused-vars ESLint rule without exceptions. All unused variables, arguments, and caught errors must now be removed or used. The `_` prefix no longer suppresses unused variable warnings.

## 0.1.1

### Patch Changes

- 042e877: Fix GitHub release formatting to support Major/Minor/Patch changes

  The release formatting script now correctly handles all changeset types (Major, Minor, Patch) instead of only Patch changes. This ensures that:
  - Section headers are removed from release notes
  - PR detection works for all release types
  - NPM badges are added correctly

## 0.1.0

### Minor Changes

- 65d76dc: Initial template setup with complete AI-driven development pipeline

  Features:
  - Multi-runtime support for Node.js, Bun, and Deno
  - Universal testing with test-anywhere framework
  - Automated release workflow with changesets
  - GitHub Actions CI/CD pipeline with 9 test combinations
  - Code quality tools: ESLint + Prettier with Husky pre-commit hooks
  - Package manager agnostic design

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
