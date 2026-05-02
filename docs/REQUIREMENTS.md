# Requirements

This document is the canonical, top-level list of requirements that
`meta-sovereign` is building against. It collects every directive from
[issue #1](https://github.com/link-foundation/meta-sovereign/issues/1)
plus the maintainer's clarifying comments on PR #2.

For an iteration-by-iteration breakdown of how requirements have been
satisfied, see
[`docs/case-studies/issue-1/requirements.md`](./case-studies/issue-1/requirements.md)
and [`docs/case-studies/issue-1/solution-plan.md`](./case-studies/issue-1/solution-plan.md).

For what remains outstanding, see [`ROADMAP.md`](./ROADMAP.md).

Each requirement carries a stable `R-*` identifier so changesets, PRs,
and code comments can reference it.

---

## A. Data layer

| ID   | Requirement                                                                               | State                                                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-A1 | Import/export with the unified database via external services (live API + bulk archives). | Done: all nine source adapters parse archives or API payloads and expose live read/write surfaces where the upstream service permits it; live imports are normalized into `msg:*` links and stamped through `pullLiveInto()`. |
| R-A2 | Import/export via `.lino` files using `links-notation` + `lino-objects-codec`.            | Done: `LinoTextStore` + indented codec round-trip in JS and Rust.                                                                                                                                                             |
| R-A3 | Unified database stored simultaneously in binary (Doublets) and text (`.lino`) form.      | Done: `DualStore` keeps both in sync with `verify()`.                                                                                                                                                                         |
| R-A4 | Regular automatic backups to a configurable archive directory.                            | Done: `createBackupScheduler` (`.unref()`-ed interval), AES-256-GCM at rest; `secret:*` links are also encrypted-at-rest via `wrapSecretStore` and never leave the local node.                                                |
| R-A5 | Indented Links Notation preferred over bracketed form for human-readable data exchange.   | Done: codec emits indented form; parser accepts both.                                                                                                                                                                         |

## B. Unified communication UI

| ID   | Requirement                                                                    | State                                                          |
| ---- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| R-B1 | Unified chat UI rendering chats from all supported services in one place.      | Done: `src/web/views.js` chat view with virtualised rendering. |
| R-B2 | Auto-completion in the chat UI based on the user's previous outgoing messages. | Done: `/api/autocomplete` + offline-client local fallback.     |
| R-B3 | Operator UI that auto-switches between chats/contexts (DONE/NEXT card stream). | Done: `operatorView` with keyboard shortcuts (D/N/⌘↵).         |
| R-B4 | Unified broadcasting UI for public posting on walls/feeds across services.     | Done: broadcast composer + `/api/broadcast`.                   |

## C. Pattern matching and reply automation

| ID   | Requirement                                                                                | State                                                                      |
| ---- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| R-C1 | Patterns editor — infer / construct / simplify / generalise regex (and PEG) from examples. | Done: `inferRegex`, `simplifyRegex`, `compilePeg`; UI table + form.        |
| R-C2 | Reply-message variation editor with fuzzy-search-driven extraction of typical replies.     | Done: Sørensen-Dice candidate finder; reply-variation groups.              |
| R-C3 | Automated dialog scripts as an n8n-style node graph linking patterns to reply variations.  | Done: `createGraph` + graph editor view + `runGraph`.                      |
| R-C4 | Two automation modes — fully automated and semi-automated (operator confirms / overrides). | Done: `mode: 'auto' \| 'semi'` flag on graph runs and outreach plans.      |
| R-C5 | Pattern matching across multiple messages to extract personal facts per participant.       | Done: `src/facts/` produces `question → answer` pairs grouped by answerer. |

## D. Personal CRM features

| ID   | Requirement                                                                              | State                                                                                               |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R-D1 | One place to view everything known about a contact (chats, groups, communities, facts).  | Done: `aggregateContacts` + `/api/contacts` + contact view.                                         |
| R-D2 | Cross-reference / intersect sets to define a target audience.                            | Done: `src/crm/audience.js` DSL — `network:foo AND chat:bar OR (sender:x AND fact:y) NOT kind:bot`. |
| R-D3 | Mass-personal outreach (start manual conversations with templated greeting per contact). | Done: `planOutreach` / `runOutreach` (1:1 envelopes); CLI `meta-sovereign outreach`.                |
| R-D4 | Configurable local search for people, communities, companies, messages, chats.           | Done: `/api/search` Sørensen-Dice with field/network/time filters.                                  |
| R-D5 | Profile sync across all connected services.                                              | Done: `/api/profile` enqueues per-network sync envelopes; SPA profile editor + e2e cover the flow.  |
| R-D6 | Resume sync across job-board services.                                                   | Done: `/api/resume` for hh / habr-career / superjob / linkedin.                                     |

## E. External-service connectors

| ID   | Requirement                             | State                                                                                                                                                                                                                            |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-E1 | Native support for **VK**.              | Done: `vk-export`-style archive parser plus VK method API live connector for conversations/history, `messages.send`, and profile/status sync.                                                                                    |
| R-E2 | Native support for **Telegram**.        | Done: Telegram Desktop archive parser handles all-chats exports and duplicate local message ids; Bot API live connector supports `getUpdates`, `sendMessage`, profile sync, `secret:telegram:*` tokens, and handled-link stamps. |
| R-E3 | Native support for **X**.               | Done: archive parser plus X API v2 connector for DM lookup/send, mention timeline import, public post publishing, and profile update.                                                                                            |
| R-E4 | Native support for **WhatsApp**.        | Done: per-chat export parser plus WhatsApp Cloud API connector for webhook message ingestion, opted-in text sends, and business profile updates.                                                                                 |
| R-E5 | Native support for **Facebook**.        | Done: download-your-data parser plus Graph/Messenger connector for page conversation import, webhook ingestion, replies, and page profile metadata updates.                                                                      |
| R-E6 | Native support for **LinkedIn**.        | Done: data-export parser plus LinkedIn REST Posts connector for API-side post import/export and resume/profile publication.                                                                                                      |
| R-E7 | Native support for **career.habr.com**. | Done: applications archive parser plus configurable authenticated live connector for application messages and resume sync.                                                                                                       |
| R-E8 | Native support for **hh.ru**.           | Done: negotiations archive parser plus hh.ru API connector for negotiations, reply messages, and resume create/update.                                                                                                           |
| R-E9 | Native support for **superjob.ru**.     | Done: vacancy-response archive parser plus SuperJob API connector for response messages and resume create/update.                                                                                                                |

## F. Distribution, sync, and deployment

| ID   | Requirement                                                                     | State                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R-F1 | Every function and feature importable as an NPM library.                        | Done: `src/*` modules expose `export` surfaces; CLI re-uses them verbatim.                                                                  |
| R-F2 | Published NPM library ships a CLI interface.                                    | Done: `bin/meta-sovereign.js` covers every server feature; `lino-arguments`-style parsing.                                                  |
| R-F3 | Published NPM library ships an Electron desktop interface.                      | Skeleton: `electron/main.js` opens the local server URL.                                                                                    |
| R-F4 | Published NPM library can start a local web server connecting to local storage. | Done: `meta-sovereign serve` (Node/Deno/Bun) and `meta-sovereign-rs serve` (pure-Rust).                                                     |
| R-F5 | All clients sync via WebRTC mapped to local storage or a configurable endpoint. | Done: `webrtc-transport.js` browser-side; `/rtc` signalling broker on both servers.                                                         |
| R-F6 | Docker microservice for the WebRTC server.                                      | Done: `docker/rtc.Dockerfile` + `docker-compose.yml`.                                                                                       |
| R-F7 | Docker microservice for the web server.                                         | Done: `docker/web.Dockerfile` + `docker-compose.yml`.                                                                                       |
| R-F8 | Universal Links access interface in both server and client.                     | Done: server = `DualStore`; client = `BrowserStore` (`doublets-web`/IndexedDB/localStorage/in-memory) ⊕ `OfflineClient` (server-preferred). |

## G. Stack constraints

| ID   | Requirement                                                                            | State                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-G1 | Default stack: JS on server + client + React for UI + Rust + WASM for heavy workloads. | Partial: Rust/WASM pattern matching and `doublets-web` browser storage are wired; SPA is currently vanilla JS, so the React port remains on the roadmap. |
| R-G2 | Alternative stack: server + microservice fully written in Rust.                        | Done: `meta-sovereign-server` crate is a zero-dep `std`-only HTTP + WS + WebRTC broker; SPA boots against it identically.                                |
| R-G3 | Cross-platform packaging (iOS, Android, Electron) via `deep-foundation/sdk`.           | Skeleton: Electron shell; mobile pending.                                                                                                                |

## H. Quality, design, and process

| ID   | Requirement                                                                   | State                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-H1 | UI follows Apple HIG / Google Material / Microsoft design best practices.     | Done: `docs/UI-DESIGN-AUDIT.md` maps every current SPA surface to Apple HIG, Material, and Fluent guidance; the app uses system fonts, large tap targets, semantic landmarks, skip-link, dark-mode toggle, stateful ARIA labels, and an axe-core WCAG 2.0 A/AA e2e audit that fails on serious or critical violations. |
| R-H2 | Code is written simply; no premature optimisations.                           | Done: vanilla JS SPA, plain `node:http` server, plain `std` Rust server.                                                                                                                                                                                                                                               |
| R-H3 | All code documented with automated API documentation generation.              | Done: `npm run docs:api` walks `src/` and `cargo doc --no-deps --workspace` covers the Rust crates; the CI `docs-build` job rebuilds both on every push/PR and the release job attaches the tarballs to each GitHub Release.                                                                                           |
| R-H4 | Test coverage spans unit, integration, and e2e (`browser-commander` for e2e). | Done: 142 JS + 53 Rust tests; real-browser e2e via `browser-commander` + Playwright in `tests/e2e-browser-spa.mjs` runs against the JS server and (with `RUN_BROWSER_E2E_RUST=1`) the pure-Rust `meta-sovereign-rs serve` binary, asserting wire-protocol parity end-to-end.                                           |
| R-H5 | CI/CD parity with the JS + Rust AI-driven-development pipeline templates.     | Done: 9-job CI matrix (Node × {Ubuntu, macOS, Windows} + Deno × 3 + Bun × 3).                                                                                                                                                                                                                                          |
| R-H6 | Project is fully open-source / public domain (Unlicense).                     | Done: `LICENSE` is Unlicense.                                                                                                                                                                                                                                                                                          |

## I. Documentation deliverable (issue #1)

| ID   | Requirement                                                        | State                                                     |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| R-I1 | Compile data into `./docs/case-studies/issue-1/`.                  | Done.                                                     |
| R-I2 | Search online for additional facts; record findings.               | Done: `external-research.md`.                             |
| R-I3 | List every requirement extracted from the issue.                   | Done: this file + `case-studies/issue-1/requirements.md`. |
| R-I4 | Propose possible solutions and a solution plan per requirement.    | Done: `solution-plan.md`.                                 |
| R-I5 | Check existing components / libraries that solve similar problems. | Done: `components.md`.                                    |

---

## J. Maintainer directives from PR #2

The following requirements arose from comments on PR #2 and are not in
the original issue body. They are tracked here so they don't get lost
between iterations.

| ID    | Requirement                                                                                                                               | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-J1  | The SPA must work fully offline using browser storage (in-memory / `localStorage` / `IndexedDB`).                                         | Done: `pickBrowserDriver()` selects `doublets-web` when bundled, then IndexedDB, localStorage, and in-memory fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R-J2  | The SPA must autodiscover a local server on localhost or LAN, with a manual override fallback when discovery fails.                       | Done: `discover.js` cascade + `saveServerOverride` / `clearServerOverride`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R-J3  | All apps (GitHub Pages Web, local Web, Mobile, Electron) must be able to use both **WebRTC** and **WebSocket** to reach the local server. | Done: WebSocket sync on `/ws`; WebRTC signalling on `/rtc` — both speak the same wire format on JS and Rust servers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R-J4  | The data store **is** the API. Every behaviour is a handler reacting to a write.                                                          | Done: `src/handlers/` registers handlers keyed by id-prefix; the broadcast handler runs the same code path whether the write originates from the SPA, CLI, or a peer sync.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R-J5  | Handled writes are clearly marked so when a handled link syncs to a peer, that peer does **not** re-fire the handler.                     | Done: handlers stamp `handled: { at, by }` on the link; the bus skips already-handled links.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R-J6  | The system must remain decentralised — a browser-only deployment (e.g. on GitHub Pages) is a complete standalone database engine.         | Done: `BrowserStore` + offline-first client + WebRTC sync between two browsers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R-J7  | All critical UI paths covered by e2e tests using [`browser-commander`](https://github.com/link-foundation/browser-commander).             | Done: `tests/e2e-browser-spa.mjs` drives headless Chromium via `browser-commander` + Playwright across the reachable critical UI paths (nav, write→reload, pattern infer→save, automation graph, broadcast, outreach, backup→restore, profile sync envelopes, theme, axe-core WCAG 2.0 A/AA audit, skip-link a11y, **two-browser WebRTC convergence** — page A writes via SPA `api.put`, page B observes the link in its isolated local store via the `/rtc`-brokered peer-to-peer data channel) on the JS server, and re-runs the protocol-parity subset against `meta-sovereign-rs serve` when `RUN_BROWSER_E2E_RUST=1` is set. |
| R-J8  | A full pure-Rust local server with **all protocols and features** so the SPA can connect to it instead of the Bun JS server.              | Done: `meta-sovereign-server` crate — REST (`/links`, `/sources`, `/api/*`), WebSocket sync (`/ws`), WebRTC signalling broker (`/rtc`), static SPA host, Prometheus `/metrics`, JSON access logs (`--log json`), CSP + hardening headers. 12 wire-protocol integration tests.                                                                                                                                                                                                                                                                                                                                                     |
| R-J9  | A `docs/REQUIREMENTS.md` (this file) and `docs/ROADMAP.md` listing missing features.                                                      | Done.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R-J10 | Plan and execute everything in a single PR (#2). Iterate until the ROADMAP is empty.                                                      | Ongoing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## Traceability

When a future PR or commit lands a feature, reference the requirement
ID in the changeset and PR description (e.g. _"R-A3: doublets+lino
dual-store skeleton"_) so this list stays a live spec rather than a
snapshot.
