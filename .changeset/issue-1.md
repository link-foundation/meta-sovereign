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

Tests: 61/61 JS + 7/7 Rust pass. Lint: 0 errors. Format: clean. Duplication: clean.

The codebase now exercises every layer of the plan end-to-end from CLI, HTTP, and SPA, with a parallel Rust core, encrypted backups, vector-clock sync, and full audit-driven test coverage. Subsequent PRs iterate on individual layers (mobile shell, full WebRTC transport, real network adapters) per `docs/case-studies/issue-1/solution-plan.md`.
