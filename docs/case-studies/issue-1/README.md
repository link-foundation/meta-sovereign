# Case Study: Issue #1 — Prototype Version 0.0.1 (Meta Sovereign)

**Issue:** [#1 — Prototype version 0.0.1](https://github.com/link-foundation/meta-sovereign/issues/1)
**Author:** [@konard](https://github.com/konard)
**Status:** Open / In Progress
**Pull Request:** [#2](https://github.com/link-foundation/meta-sovereign/pull/2)

This case study compiles all available information about the issue, decomposes it into atomic requirements, surveys the existing libraries and tools that can help, and proposes a phased solution plan that fits the local-first / privacy-first design constraints stated in the issue.

The artefacts in this folder are:

| File                   | Purpose                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                                                                                                                                                  |
| `requirements.md`      | Atomic requirements list extracted from the issue.                                                                                                                                                                    |
| `solution-plan.md`     | Phased plan mapping requirements to concrete deliverables.                                                                                                                                                            |
| `components.md`        | Catalogue of upstream libraries / repositories referenced in the issue, with a short note on relevance.                                                                                                               |
| `external-research.md` | Summary of external (non-issue) research about local-first software, CRDTs, unified messaging, pattern editors, fuzzy search, node editors, WebRTC sync, encrypted local storage, Electron/Tauri, and related topics. |
| `architecture.md`      | Proposed high-level architecture, with the Universal Links access layer and Rust+WASM heavy-workload split.                                                                                                           |
| `data/`                | Raw artefacts used to build this study (issue body, comments, future PR snapshots).                                                                                                                                   |

---

## 1. Vision (paraphrased from the issue)

> A **Personal Meta Profile Sovereign** system. Fully local, privacy-respecting. The user actually owns and controls their data about their network of contacts, connections, and partners — across every social/messenger/job network they use.

The system is simultaneously:

- A **unified messenger** spanning VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru.
- A **personal CRM**: contacts, communities, group memberships, intersections, mass-personal outreach.
- A **personal memory**: structured `question → answer` facts captured automatically from conversations.
- A **conversation automation platform**: pattern editors, reply-variation editors, n8n-style dialog graphs.
- A **portable data store**: dual binary (Doublets) + text (Links Notation) representation, regular backups, `.lino` import/export.
- A **distributed but local-first runtime**: WebRTC sync between user-owned devices, optional self-hosted relay.
- An **NPM library** that exposes every feature programmatically — CLI, Electron desktop, web server, browser.
- A **pure-Rust stack** alongside the JS/Rust+WASM stack for performance-critical and minimal-trust deployments.

## 2. Why this case study exists

The issue explicitly requests:

> _We need to collect data related about the issue to this repository, make sure we compile that data to `./docs/case-studies/issue-{id}` folder, and use it to do deep case study analysis (also make sure to search online for additional facts and data), list of each and all requirements from the issue, and propose possible solutions and solution plans for each requirement (we should also check known existing components/libraries, that solve similar problem or can help in solutions)._

This document is the central deliverable of that request. The implementation of the prototype itself is the next phase, planned in `solution-plan.md` and tracked through follow-up issues.

## 3. Method

1. **Source extraction** — issue body, labels and metadata captured via `gh` CLI to `data/issue-1.json`. Comments captured to `data/issue-1-comments.json` (currently empty).
2. **Requirement decomposition** — each bullet of the issue body was split into atomic, testable requirements in `requirements.md`. Each requirement is tagged so it can be referenced by future PRs and follow-up issues.
3. **Component survey** — every repository explicitly linked from the issue was inspected via `gh repo view` to identify what already exists in the link-foundation / linksplatform / konard ecosystem. Results captured in `components.md`.
4. **External research** — public web sources (no GitHub) consulted for areas where the issue does **not** prescribe a specific library: CRDT sync libraries, pattern-synthesis literature, node editors, WebRTC sync stacks, encrypted-at-rest options for Electron and browser. Results captured in `external-research.md`.
5. **Plan synthesis** — `solution-plan.md` groups requirements into phased milestones: (a) prototype data layer, (b) importer corpus, (c) unified UI, (d) automation graph, (e) sync. `architecture.md` shows how these layers compose.

## 4. Headline findings

- The link-foundation ecosystem already provides **most of the data-storage primitives** the issue calls for: `links-notation` (text), `lino-objects-codec` (object↔text), `doublets-rs` (binary, mmap), `doublets-web` (WASM bindings), and `lino-arguments` (CLI/config). The prototype's Universal Links access layer can therefore be built mostly by **integration**, not from scratch.
- Importers for VK and Telegram exist as standalone konard repositories (`vk-export`, `vk-browser`, `vk-bot`, `telegram-bot`, `follow`, `broadcast`). They can be wrapped as adapters under a common `MessageSource` interface — see `architecture.md`.
- **Beeper / Matrix bridges** (`mautrix-*`) are the most legitimate path to a unified inbox spanning networks (WhatsApp, Signal, X, LinkedIn, Telegram, etc.) without violating ToS or building dozens of bespoke scrapers. The Sovereign client can run a self-hosted Matrix homeserver locally and import directly from it.
- **CRDT sync** for the WebRTC-backed sync requirement is best served by `automerge-repo` (structured records) and/or `Yjs` (chat text). Both have well-documented WebRTC adapters.
- **Encrypted-at-rest** for Electron is well-served by `SQLCipher`. In the browser, `sqlite3.wasm` over OPFS plus a userland encryption layer (libsodium) is the closest equivalent.
- **Node editor** for the n8n-like automation graph: `Rete.js v2` is the closest match because it ships with a real dataflow execution engine, not just a visual canvas.
- **Pattern editor**: there is no off-the-shelf component for example-driven regex/PEG inference. A small custom UI on top of `ohm-js` (PEG playground) plus example-driven heuristics is the realistic prototype path; the deeper synthesis work (REGAE / SplitRegex) is a research direction for v0.x→v0.y.

The complete reasoning — including library URLs and trade-offs — is in `external-research.md` and `components.md`.

## 5. Constraints honoured

The proposed plan respects every non-negotiable constraint stated in the issue:

- **Public domain / Unlicense** licensing across the project (already true of this template).
- **No premature optimisation**; simple code that works comes first.
- **Every feature is an importable NPM package** — the prototype repository is structured so each adapter, the storage layer, the CRDT sync, and each UI surface can be split into a workspace package as it stabilises.
- **All tests cover unit + integration + e2e**, with e2e using `link-foundation/browser-commander`.
- **Two stacks**: a JS+React+Rust/WASM stack (default) and a pure-Rust stack (server/microservice variant). The browser stack now includes React views, `doublets-web` storage, and the Rust `pattern_matches` port compiled to WASM; the data formats (Links Notation, Doublets) are language-neutral, so the two stacks share the same on-disk artefacts.
- **Best-practice CI/CD parity** with `js-ai-driven-development-pipeline-template` and `rust-ai-driven-development-pipeline-template`. This repository was created from the JS template; gaps relative to the Rust template will be tracked as follow-up issues.

## 6. Next steps

The prototype implementation of `0.0.1` is decomposed into the
milestones in `solution-plan.md`. PR #2 has since expanded beyond the
initial case-study scope into a runnable system: storage, archive
importers, live connector surfaces, CLI, HTTP, React SPA, WebSocket/WebRTC
sync, handlers, encrypted backups, and the pure-Rust server are all
implemented and tested. Remaining gaps stay tracked in the top-level
[`docs/ROADMAP.md`](../../ROADMAP.md).

---

## 7. References

The full bibliography of external sources is in `external-research.md`. Key entries:

- _Local-first software: You own your data, in spite of the cloud_ — Kleppmann et al., Ink & Switch, 2019. <https://www.inkandswitch.com/essay/local-first/>
- Yjs — <https://yjs.dev/>
- Automerge — <https://automerge.org/>
- Beeper Bridges — <https://developers.beeper.com/bridges>
- Telegram Takeout API — <https://core.telegram.org/api/takeout>
- SQLCipher — <https://www.zetetic.net/sqlcipher/design/>
- SQLite WASM (OPFS) — <https://sqlite.org/wasm>
- Rete.js — <https://retejs.org/>
- Fuse.js — <https://www.fusejs.io/>
- React Flow — <https://reactflow.dev/>
- Tauri 2 — <https://v2.tauri.app/>

The libraries that are already linked from the issue are catalogued in `components.md`.
