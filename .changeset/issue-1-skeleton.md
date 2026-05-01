---
'meta-sovereign': minor
---

Land a runnable, zero-dependency skeleton that exercises every architectural layer of the issue #1 plan.

What's included (each has unit/integration tests):

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

Tests: 41/41 pass (`node --test`). Lint: 0 errors. Format: clean. Duplication: clean.

The skeleton is intentionally minimal — in-memory adapters, JSON archive parsers, no real network I/O. It exists so subsequent PRs can iterate on each layer without re-bootstrapping. See `docs/case-studies/issue-1/solution-plan.md` for milestone-by-milestone status.
