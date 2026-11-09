# Issue 56 / PR 57 work plan

Objective: fully implement and verify every requirement of issue 56 and every required sub-issue in this single PR. Keep unmet criteria explicitly unfinished and keep the PR unmerged.

## Research and requirements

- [x] Verify prepared branch and clean starting state; read contributor and product guidance.
- [x] Read complete issue and initial issue/PR conversation, inline comments and reviews; preserve raw snapshots.
- [ ] Inventory required sub-issues and every prose requirement, including all features in six reference repositories.
- [ ] Pin and inspect reference sources, latest related PRs, associative stack and current dependency releases; retain research evidence.
- [ ] Map each requirement to existing code, root cause/gap, implementation plan and verification evidence.
- [ ] Reconstruct timeline and alternatives in the case study; report reproducible upstream defects if found.

## Implementation workstreams (all required)

- [ ] Unified configurable question recognition, substitution and answer automation across every chat, through CLI, API and UI.
- [ ] Complete hh job search/application, form filling, messaging/unread Operator support and advanced CV synchronization parity.
- [ ] Complete broadcast, telegram-bot, follow, vk-bot and vk-bot-desktop feature parity through all three control surfaces.
- [ ] Browser-commander across providers, headed defaults and persistent per-case/per-slot headless configuration.
- [ ] Update every dependency and use current associative stack capabilities; report missing capabilities/defects with reproductions.
- [ ] Full latest link-cli storage; default lino-rest-api with text/binary Links Notation; JSON compatibility opt-in only.
- [ ] Scheduled text and binary recovery dumps and verified restore.
- [ ] Shared React landing and /app on Pages, opt-in local server, Electron, Android and iOS; unsigned builds work; real Apple deployment instructions.
- [ ] Bidirectional server discovery, connection and sync across desktop/mobile; full mobile-supported features and accurate capability UI.
- [ ] User-controlled replication, partial placement, cache migration and recovery across devices including iPhone storage.
- [ ] Investigate full browser/container/emulation options on iPhone and implement supported local/remote browser execution with honest capabilities.

## Verification and delivery

- [ ] Draft all requirements before focused verification; use existing patterns and offline fixtures.
- [ ] Add meaningful failing-before/passing-after regressions for fixes; preserve reusable experiments/examples.
- [ ] Capture UI before/after screenshots with browser-commander and Playwright MCP; commit reviewable evidence.
- [ ] Update requirement ledger in four languages, relevant documentation and changeset.
- [ ] Run focused low-concurrency local checks only; keep resource-intensive builds/matrices in CI.
- [ ] Commit useful atomic steps, merge latest main, push only issue-56-2677debd3a31.
- [ ] Inspect exact-head CI with timestamps/SHAs; preserve and read nonpassing logs, resolve failures and verify all checks.
- [ ] Review complete PR diff for regressions, removed features and requirement coverage; clean working tree and no outstanding commands.
- [ ] Replace placeholder PR title/body with concrete behavior, reproduction, tests, screenshots and positive closing references.
- [ ] Mark PR 57 ready only after all acceptance criteria are implemented and verified; keep native goal active until then.

Initial evidence: no issue comments, PR conversation comments, inline comments, reviews or required sub-issues were returned at collection. These endpoints must be refreshed before finalization.

Current focused work: shared X OAuth 1.0a/OAuth 2.0/app-only transport, receipt-checked publishing/deletion, redacted probes and diagnostics pass 71 focused checks and real Chrome; see x-publishing-auth.md and upstream konard/broadcast#3. The confirmed Broadcast screen and delivery accounting already pass focused/browser checks. All five workflows and all 34 Checks jobs pass at 2284c2f5; the subsequent X transport change needs its own exact-head CI. Continue saved destinations, credential-mode controls and full provider lifecycle through CLI/API/UI, then the remaining source inventory. Every issue-wide workstream remains open and PR 57 stays draft.

Resolved diagnostic: no-Telegram cached chat advertised no capabilities yet started unsupported notification/account-event requests. Explicit status capabilities and shared browser gating now pass six targeted regressions, the existing notification browser flow and independent MCP against the actual no-account server; see telegram-capabilities.md. Full mobile/provider capability coverage remains open.

Resolved diagnostic: the isolated no-sync fixture's unsupported RTC connection has three failing-before regressions, 12 passing discovery/capability checks, production Chromium and independent MCP verification. Actual listener capabilities now survive discovery and suppress the unavailable broker; see sync-capabilities.md. The subsequent optional-operation correction suppresses unavailable quick-reaction and URL-auth-domain requests; see telegram-optional-capabilities.md. Full mobile/provider availability remains open.

## Current CI investigation protocol

- [x] List five latest runs with creation times and head SHAs.
- [x] Compare against the latest pushed commit before interpreting results.
- [x] Download complete logs for every nonpassing runtime job and the final workflow.
- [x] Read each failure section and report concrete errors with raw log line numbers.
- [x] Reproduce the two discovery assertions locally and verify their fixture correction.
- [ ] Push and review the new exact-head matrix; preserve any new nonpassing evidence.
