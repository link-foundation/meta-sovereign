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

**Status**: in progress in PR #2.

**Out of scope**: any feature implementation. Everything below is a follow-up PR.

---

## Milestone 1 — Storage skeleton (Universal Links Access)

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

## Milestone 2 — Backups & `.lino` import/export

**Requirements:** R-A1, R-A2, R-A4.

**Deliverables:**

1. `meta-sovereign backup` CLI subcommand that snapshots the storage directory to `${backup_dir}/YYYY/MM/DD/HH-MM-SS.tar.zst`.
2. Retention policy configurable via `lino-arguments` (keep N daily, M weekly, etc.).
3. `meta-sovereign import --file=foo.lino` and `meta-sovereign export --file=bar.lino`.
4. e2e test: import → mutate → export → diff yields a recognisable change set.

**Tools:** `lino-arguments`, `tar`, `zstd-codec` or `node:zlib`/system `zstd`.

---

## Milestone 3 — First importer adapter (Telegram)

**Requirements:** R-E2, R-A1, partial R-D1.

Telegram is the first adapter because the konard repos already provide a working implementation (`telegram-bot`, `follow`, `telegramify-markdown`).

**Deliverables:**

1. NPM package `@meta-sovereign/source-telegram` implementing `MessageSource`.
2. `meta-sovereign import --source=telegram --archive=path` for Telegram Desktop JSON exports.
3. `meta-sovereign import --source=telegram --takeout` for the live Takeout API.
4. Mapping from Telegram message → unified `Message` link, including: sender, chat, timestamp, reply-to, edits, media references.
5. Integration tests against fixture archives.

---

## Milestone 4 — Second importer (VK), establishes the adapter pattern

**Requirements:** R-E1, R-A1.

**Deliverables:**

1. `@meta-sovereign/source-vk` wrapping `vk-export` (HTML archive) and the Kate-Mobile token pipeline (`vk-bot` / `vk-browser`).
2. The `MessageSource` interface is finalised based on lessons from Telegram + VK; documented in `architecture.md` as stable.
3. Tests against real archive samples (anonymised).

---

## Milestone 5 — Unified Chat UI (read-only)

**Requirements:** R-B1.

**Deliverables:**

1. NPM package `@meta-sovereign/web` — a React + Vite app that reads from `UniversalLinksAccess` over HTTP/WebSocket.
2. Chat list, message list with virtualised scrolling, search bar (powered by MiniSearch).
3. UI quality bench-marked against Telegram Desktop.
4. e2e tests via `browser-commander`.

**Out of scope at this milestone:** sending messages back, auto-completion, operator mode, multi-network differences (each network is rendered the same way).

---

## Milestone 6 — Operator UI

**Requirements:** R-B3, partial R-B2.

**Deliverables:**

1. Card-stream view modeled on `link-assistant/operator`. Two actions: DONE / NEXT.
2. Auto-completion in the message composer fed by MiniSearch over the user's outgoing messages.
3. Keyboard-driven workflow (D / N for DONE/NEXT, ⌘↵ to send, etc.).
4. e2e tests for the queue progression.

---

## Milestone 7 — Pattern editor + reply-variation editor

**Requirements:** R-C1, R-C2, R-C5.

**Deliverables:**

1. NPM package `@meta-sovereign/patterns` with a `Pattern` model (regex or PEG via Ohm-JS), simplification heuristics, and an example-driven generator.
2. NPM package `@meta-sovereign/replies` with a `ReplyVariationGroup` model and a Fuse.js-based fuzzy candidate finder.
3. UI: pattern editor (left: examples, right: live regex/PEG, bottom: matches), reply-variation editor (group list with tag chips).
4. Fact extractor that, given a patterns set, scans conversations for `question → answer` pairs (R-C5). Output rendered per participant in group chats.

---

## Milestone 8 — Dialog automation graph

**Requirements:** R-C3, R-C4.

**Deliverables:**

1. Rete.js v2 canvas integrated into `@meta-sovereign/web`.
2. Node types: `PatternNode`, `BranchNode`, `ReplyVariationNode`, `SendMessageNode`, `WaitForNode`.
3. Two run modes (auto / semi-auto). Semi-auto surfaces candidate replies in the Operator UI.
4. The graph is persisted via `UniversalLinksAccess` so it is part of the unified database.

---

## Milestone 9 — CRM features

**Requirements:** R-D1, R-D2, R-D3, R-D4, partial R-D5/R-D6.

**Deliverables:**

1. Contact-detail page that aggregates everything known (chats, groups, communities, extracted facts).
2. Saved-query language for set intersections (e.g. `group("Foo") AND fact("speaks_russian")`).
3. Mass-personal kick-off helper (templated greeting per contact in a saved query).
4. Local search (R-D4) wired to MiniSearch + Fuse.js.

---

## Milestone 10 — Sync layer (WebRTC + CRDT)

**Requirements:** R-F5, R-F6.

**Deliverables:**

1. `automerge-repo` integrated against `UniversalLinksAccess`.
2. WebRTC adapter (`@automerge/automerge-repo-network-webrtc`).
3. Optional Docker microservice `meta-sovereign-rtc` that runs the signalling server (R-F6).
4. End-to-end test: two browsers connect, mutate, see each other's changes.

---

## Milestone 11 — Outbound broadcasting & profile sync

**Requirements:** R-B4, R-D5, R-D6.

**Deliverables:**

1. `@meta-sovereign/broadcast` integrating `konard/broadcast` for X / Telegram / VK posting.
2. Profile sync UI that pushes the user's avatar / bio to every authenticated network (gracefully no-ops where APIs forbid it).
3. Resume sync for hh.ru, career.habr.com, superjob.ru, LinkedIn (R-E6, R-E7, R-E8, R-E9).

---

## Milestone 12 — Remaining importers

**Requirements:** R-E3, R-E4, R-E5, R-E6, R-E7, R-E8, R-E9.

**Deliverables:**

1. `@meta-sovereign/source-x` (X archive importer).
2. `@meta-sovereign/source-whatsapp` (per-chat export importer).
3. `@meta-sovereign/source-facebook` (download-your-data archive).
4. `@meta-sovereign/source-linkedin` (data export archive).
5. `@meta-sovereign/source-habr-career`, `@meta-sovereign/source-hh`, `@meta-sovereign/source-superjob` (resume + applications sync).

Each follows the `MessageSource` interface finalised in milestone 4.

---

## Milestone 13 — Pure-Rust stack

**Requirements:** R-G2.

**Deliverables:**

1. `meta-sovereign-rs/server` (`axum` + `doublets-rs` + Rust lino codec).
2. `meta-sovereign-rs/cli`.
3. Conformance test suite that runs the same fixture imports through both stacks and diffs the resulting Doublets file.

---

## Milestone 14 — Mobile and Electron polish

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
