# Requirements — Issue #1

This document decomposes the issue body into atomic, testable requirements. Each requirement has a stable identifier (`R-…`) so future PRs and follow-up issues can reference it.

The grouping follows the structure of the issue itself.

## A. Data layer (storage and exchange)

| ID   | Requirement                                                                                        | Notes                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-A1 | Import/export with the unified database via external services (API and bulk export archive files). | Covers VK takeout, Telegram export, WhatsApp `Export chat`, Facebook download-your-data, X archives, LinkedIn data export, plus any platform API.                                                                                             |
| R-A2 | Import/export with the unified database via `.lino` files.                                         | Reuses [`links-notation`](https://github.com/link-foundation/links-notation) and [`lino-objects-codec`](https://github.com/link-foundation/lino-objects-codec).                                                                               |
| R-A3 | Unified database stored in **both** binary form and text form, simultaneously.                     | Binary: [`doublets-rs`](https://github.com/linksplatform/doublets-rs) + [`doublets-web`](https://github.com/linksplatform/doublets-web) + [`link-cli`](https://github.com/link-foundation/link-cli). Text: `.lino`. The two are kept in sync. |
| R-A4 | Regular automatic backups of the unified database into a configurable archive target folder.       | Periodic snapshots, retention policy configurable, format = `.lino` + binary doublets snapshot bundled (e.g. `.tar.zst`).                                                                                                                     |
| R-A5 | Indented Links Notation is preferred over bracketed form for all human-readable data exchange.     | Reduces parenthesis noise; matches `links-notation`'s indented dialect.                                                                                                                                                                       |

## B. Unified communication UI

| ID   | Requirement                                                                                                   | Notes                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-B1 | Unified chat UI rendering chats from **all** supported external services in one place.                        | Quality bar: Telegram clients ([`drklo/telegram`](https://github.com/drklo/telegram), [`telegramdesktop/tdesktop`](https://github.com/telegramdesktop/tdesktop)). |
| R-B2 | Auto-completion in the chat UI based on the user's previous outgoing messages.                                | Source = local message history, ranked by recency / fuzzy similarity.                                                                                             |
| R-B3 | **Operator UI** that auto-switches between chats/contexts so the user can focus on one unread item at a time. | Inspired by [`link-assistant/operator`](https://github.com/link-assistant/operator) (DONE / NEXT card stream).                                                    |
| R-B4 | Unified broadcasting UI for public posting on walls/feeds/public posts in all services.                       | Reuses [`konard/broadcast`](https://github.com/konard/broadcast) for the outbound side.                                                                           |

## C. Pattern matching and reply automation

| ID   | Requirement                                                                                                                                   | Notes                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| R-C1 | **Patterns editor** — automatically infer / construct / simplify / generalise regular expressions and PEGs from one or more example messages. | Includes fuzzy search to find candidate messages from history.                              |
| R-C2 | Reply-message variation editor with fuzzy-search-driven extraction of typical replies to a question.                                          | User can manually add as many variations as desired.                                        |
| R-C3 | **Automated dialog scripts** rendered as an n8n-style node graph linking patterns to reply variations.                                        | Visualises dialog tree from history; supports multi-stage flows (greet → small-talk → ask). |
| R-C4 | Two automation modes: fully automated and semi-automated (operator confirms / overrides each detected reaction).                              | Manual select of variation, confirm random selection, or override.                          |
| R-C5 | Pattern matching across **multiple messages** to extract personal facts about each conversation partner.                                      | Output: `question → answer` pairs, attributed per participant in group chats.               |

## D. Personal CRM features

| ID   | Requirement                                                                                                   | Notes                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| R-D1 | One place to view everything known about a contact (chats, group memberships, communities, extracted facts).  | The contact-detail page.                                                       |
| R-D2 | Cross-reference / intersect sets of chats, groups, communities, and facts to define a target audience.        | E.g. "people who are in group X **and** mentioned topic Y".                    |
| R-D3 | Mass-personal outreach to a target audience (start manual conversations with a templated greeting / sticker). | Each conversation is still 1:1; the audience filter just batches the kick-off. |
| R-D4 | Configurable local search for people, communities, companies, messages, chats.                                | Field selection, fuzzy matching, time range, network filter.                   |
| R-D5 | Profile sync across all connected services.                                                                   | Push profile updates to every service from one place.                          |
| R-D6 | Resume sync across job-board services (career.habr.com, hh.ru, superjob.ru, LinkedIn).                        | Same idea as profile sync but for CV.                                          |

## E. External-service connectors

| ID   | Requirement                             | Notes                                                                                                                                                                                                                                                                                |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-E1 | Native support for **VK**.              | Reuse [`konard/vk`](https://github.com/konard/vk), [`konard/vk-bot`](https://github.com/konard/vk-bot), [`konard/vk-export`](https://github.com/konard/vk-export), [`konard/vk-browser`](https://github.com/konard/vk-browser), [`konard/follow`](https://github.com/konard/follow). |
| R-E2 | Native support for **Telegram**.        | Reuse [`konard/telegram-bot`](https://github.com/konard/telegram-bot), [`konard/follow`](https://github.com/konard/follow), [`konard/telegramify-markdown`](https://github.com/konard/telegramify-markdown).                                                                         |
| R-E3 | Native support for **X**.               | Outbound covered by [`konard/broadcast`](https://github.com/konard/broadcast). Inbound = X archive import.                                                                                                                                                                           |
| R-E4 | Native support for **WhatsApp**.        | Inbound = "Export chat" archives + WhatsApp Business Cloud API for opted-in flows.                                                                                                                                                                                                   |
| R-E5 | Native support for **Facebook**.        | Inbound = Facebook download-your-data archive.                                                                                                                                                                                                                                       |
| R-E6 | Native support for **LinkedIn**.        | Inbound = LinkedIn data export.                                                                                                                                                                                                                                                      |
| R-E7 | Native support for **career.habr.com**. | Resume + job applications sync.                                                                                                                                                                                                                                                      |
| R-E8 | Native support for **hh.ru**.           | Resume + job applications sync.                                                                                                                                                                                                                                                      |
| R-E9 | Native support for **superjob.ru**.     | Resume + job applications sync.                                                                                                                                                                                                                                                      |

## F. Distribution, sync, and deployment

| ID   | Requirement                                                                                                         | Notes                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R-F1 | Every function and feature must be importable as an NPM library.                                                    | Implies a workspace / monorepo layout once the prototype grows.                                                                             |
| R-F2 | The published NPM library ships a **CLI** interface.                                                                | CLI args use [`lino-arguments`](https://github.com/link-foundation/lino-arguments).                                                         |
| R-F3 | The published NPM library ships an **Electron desktop** interface.                                                  | One desktop binary per OS.                                                                                                                  |
| R-F4 | The published NPM library can start a **local web server** that connects to local storage.                          | Browser tab connects to it.                                                                                                                 |
| R-F5 | All clients (desktop / web / mobile) sync via **WebRTC**, mapped onto local storage **or** a configurable endpoint. | If user opts in, can host a personal cloud to ease access from mobile.                                                                      |
| R-F6 | A **Docker microservice** for the WebRTC server is provided.                                                        | Optional — users can run it on a VPS.                                                                                                       |
| R-F7 | A **Docker microservice** for the web server is provided.                                                           | Optional — same idea.                                                                                                                       |
| R-F8 | A **universal Links access interface** is exposed in both server and client.                                        | On client = local cache + direct server access. On server = simultaneous read/write to binary (Doublets) and text (Links Notation) storage. |

## G. Stack constraints

| ID   | Requirement                                                                                                             | Notes                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R-G1 | Default stack: JavaScript on server and client + React.js for UI + Rust + WebAssembly for heavy workloads.              | Heavy workload = pattern matching, full-text search, doublets I/O.                                      |
| R-G2 | Alternative stack: server + microservice fully written in **Rust**.                                                     | Complete parity for users who prefer minimum JS surface.                                                |
| R-G3 | Cross-platform packaging (iOS, Android, Electron) uses [`deep-foundation/sdk`](https://github.com/deep-foundation/sdk). | The issue lists this as the chosen base. Capacitor / Tauri are alternatives if SDK proves insufficient. |

## H. Quality, design, and process

| ID   | Requirement                                                                                                                                                                                                                                                                            | Notes                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R-H1 | UI follows the best practices of [Apple HIG](https://developer.apple.com/design/human-interface-guidelines), [Google Material](https://design.google), and Microsoft's design guidelines.                                                                                              | Documented design checklist per surface.                                                          |
| R-H2 | Code is written in a simple way; no premature optimisations.                                                                                                                                                                                                                           | Optimise only after measurement.                                                                  |
| R-H3 | All code is documented with **automated** API documentation generation.                                                                                                                                                                                                                | TypeDoc for JS/TS, rustdoc for Rust.                                                              |
| R-H4 | Test coverage spans unit, integration, and e2e.                                                                                                                                                                                                                                        | E2e uses [`browser-commander`](https://github.com/link-foundation/browser-commander).             |
| R-H5 | CI/CD parity with [`js-ai-driven-development-pipeline-template`](https://github.com/link-foundation/js-ai-driven-development-pipeline-template) and [`rust-ai-driven-development-pipeline-template`](https://github.com/link-foundation/rust-ai-driven-development-pipeline-template). | Any gap discovered while building this repo should be reported back upstream as a template issue. |
| R-H6 | The project is fully open-source / public domain (Unlicense).                                                                                                                                                                                                                          | "Requiring no trust."                                                                             |

## I. Documentation deliverable (this issue)

| ID   | Requirement                                                             | Notes                                              |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| R-I1 | Compile data related to this issue into `./docs/case-studies/issue-1/`. | Met by this folder.                                |
| R-I2 | Search online for additional facts and data; record findings.           | Met by `external-research.md`.                     |
| R-I3 | List every requirement extracted from the issue.                        | Met by this file.                                  |
| R-I4 | Propose possible solutions and a solution plan per requirement.         | Met by `solution-plan.md`.                         |
| R-I5 | Check for existing components / libraries that solve similar problems.  | Met by `components.md` and `external-research.md`. |

---

## Requirements traceability

When future PRs land features, they should cite the requirement ID in the changeset and PR description (e.g. _"R-A3: doublets+lino dual-store skeleton"_) so this list stays a live spec rather than a snapshot.
