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

Current focused work: TG01–TG06 cover exact/migrated/active history export, provenance-aware user scans, reviewed no-phone contact import and owned phone/2FA/QR sign-in through CLI/default Lino API/shared UI. The user/contact slice passes 63 focused checks; login passes 48. Both have production Chrome and independent MCP desktop/mobile evidence. See telegram-users.md and telegram-login.md. The midnight birthday fixture correction passes its focused reproduction. Windows Deno passes on efd51d8e with startup traces; the earlier failure's cause remains unproven. That head's WebKit run was cancelled, so the exact current-head matrix remains required. Continue TG07–TG10 and every remaining issue-wide workstream. PR 57 stays draft and unmerged.

TG07–TG10 audit: an empty resolved sticker RPC previously counted as a successful delivery. A failing-before regression now passes with positive request/peer-matched receipt checks, retained message IDs and uncertain outcomes for missing receipts. All 35 focused sticker/receipt checks and strict lint pass. See telegram-greetings.md; catalog, bot and group workflows remain unfinished.

TG08 backend/CLI draft: explicit featured/mask/recent/favourite discovery now retains account-scoped usable documents, bounded pagination and complete/partial coverage. Failed/cancelled refreshes preserve the cache; expired references reread their origin. Nineteen catalog/CLI/production Lino checks cover these paths and shutdown ownership. A finite installed-SDK mask-shape probe supports upstream report konard/telegram-bot#16. Shared catalog UI and TG07/TG09/TG10 remain open.

TG08 catalog UI: common React controls now expose explicit bounded refresh, cancellation, cache age, source coverage, filtering and pages. Forty-four model/Greetings/locale checks, a failing-before/passing-after production Chromium flow and independent MCP desktop/mobile verification pass. Retained cache recovery and capability loss are covered; screenshots and logs are preserved in telegram-greetings.md. Chosen-target greeting sends and TG07/TG09/TG10 remain unfinished. Continue those before marking TG08 complete.

TG07/TG08 reviewed sends: common CLI/Lino API/React controls now preview exact account, typed target and frozen greeting or `/start`, then consume one confirmed plan. Positive receipts, durable uncertain-write protection, rolling 24-hour greeting deduplication, last-moment account/peer guards and owned cancellation/shutdown are covered by 53 focused core checks, 45 model/Greetings/locale checks and 57 existing compatibility checks. Two failing-before sender-guard regressions, the production Chromium before/after flow and independent MCP desktop/mobile screenshots are preserved in telegram-greetings.md. This supersedes the earlier chosen-target/bot gaps. Continue TG09/TG10 participant eligibility, group limits, pacing and acknowledged progress; every other issue-wide open requirement remains required.

TG09/TG10 group follow-up: participant-only groups/megagroups now share read-only scanning/previews and explicitly confirmed private greetings across CLI/Lino API/UI. Requested exclusions and visible full business-profile checks, frozen per-recipient stickers, limits, default 30-second pacing, shared durable 24-hour/unknown-write protection and acknowledgement-first progress pass 70 focused core/compatibility and 43 UI/locale checks, production Chromium and independent MCP desktop/mobile. Two startup lifetime regressions fail against the preceding commit and pass with owned preflight cancellation/shutdown. Evidence is in telegram-group-greetings.md. This supersedes the earlier TG09/TG10 gaps. Continue every other issue-wide open criterion and the exact-head CI matrix; PR 57 remains draft and unmerged.

Resolved diagnostic: no-Telegram cached chat advertised no capabilities yet started unsupported notification/account-event requests. Explicit status capabilities and shared browser gating now pass six targeted regressions, the existing notification browser flow and independent MCP against the actual no-account server; see telegram-capabilities.md. Full mobile/provider capability coverage remains open.

Resolved diagnostic: the isolated no-sync fixture's unsupported RTC connection has three failing-before regressions, 12 passing discovery/capability checks, production Chromium and independent MCP verification. Actual listener capabilities now survive discovery and suppress the unavailable broker; see sync-capabilities.md. The subsequent optional-operation correction suppresses unavailable quick-reaction and URL-auth-domain requests; see telegram-optional-capabilities.md. Full mobile/provider availability remains open.

Resolved delivery diagnostic: raw and library-only Telegram text sends now require valid message receipts, retain missing/duplicate/partial outcomes as uncertain and stop remaining parts. Shared Chat/Operator bubbles and directory accessibility labels use localized uncertainty guidance, with no automatic retry through refresh. Seven failing-before sender cases and a failing-before four-language rendered UI case now pass; 50 focused core and 22 UI checks, production Chromium and independent MCP desktop/mobile pass. See telegram-text-receipts.md. Every other open issue-wide criterion remains required. The older fccb2648 matrix was cancelled during a timed-out macOS checkout before tests; see ci-checkout-fccb2648.md. Continue the exact-head matrix separately.

## Current CI investigation protocol

TG06 lifecycle audit: five failing-before regressions now pass with temporary-client destruction, no late cancelled credential publication, explicit expiry, fresh code/2FA prompts and awaited server shutdown. All 34 focused login checks pass. CLI phone/2FA and read-only verified legacy import add 15 passing CLI/route/installed-SDK checks, including a failing-before Ctrl+C outcome and masked prompt/EOF cleanup. See telegram-login.md. The 48-check combined group, failing-before stale QR regression, actual-route phone/finder Chrome flow, existing QR browser flow and independent MCP desktop/mobile verification now cover TG06. Both browser flows are registered for CI. Continue TG07–TG10. Broader optional cached-chat capability reads remain open.

- [x] List five latest runs with creation times and head SHAs.
- [x] Compare against the latest pushed commit before interpreting results.
- [x] Download complete logs for every nonpassing runtime job and the final workflow.
- [x] Read each failure section and report concrete errors with raw log line numbers.
- [x] Reproduce the earlier discovery assertions locally and verify their fixture correction.
- [x] Preserve 124a2234 Windows Deno and WebKit failures with exact SHA/timestamps.
- [ ] Diagnose Windows rolling-host startup before any timing changes.
- [x] Reproduce WebKit older-wishes failure at midnight and fix the isolated browser/fixture clock; see ci-124a2234.md.
- [ ] Push and review the new exact-head matrix; preserve any new nonpassing evidence.

Resolved CI fixture regression: f5091260 passed every runtime and auxiliary workflow but both browser jobs found two matching greeting disclosure headings. Direct-child selectors preserve both original workflows, now passing sequentially in Chromium after a failing-before reproduction. See ci-greeting-panel-selectors.md; the current exact-head full matrix remains required.

FL02: shared incoming Telegram-link extraction, source-message provenance, typed candidates and filtered clearable Lino caching now pass 12 focused Follow and 25 locale checks, production Chromium and independent MCP desktop/mobile. A failing-before empty-response regression prevents switching from a failed server to the browser cache. See follow-links.md. Continue FL01 and FL03–FL09, every other open workstream and exact-head CI; PR 57 remains draft and unmerged. The 230f1805 formatting failure is corrected in f49ea3e5; see ci-requirements-format.md.

FL01: bounded live VK group discovery, raw provider pagination, Telegram title/latest-message hints, paged member details and recent-message previews now share CLI/default Lino API/React controls. Forty-six focused checks, production Chromium and independent MCP desktop/mobile pass; see follow-chats.md. FL03–FL09, every other issue-wide open criterion and exact-head CI remain required. The f87a0506 secret-scan fixture failure is corrected in 3a73cc07; see ci-follow-fixture.md.

FL03/FL05 prerequisite: shared invite/public-join receipts and mute/archive acknowledgements now have six failing-before regressions, 60 passing focused checks and production Chromium/MCP desktop/mobile evidence; see telegram-membership-receipts.md. The complete Follow membership/preferences workflow, including listing and reviewed leave, remains unfinished. The GitHub required-sub-issues endpoint returned an empty array on 2026-11-10; the original issue names six reference projects without explicit required issue IDs. Their feature parity and all wider prose requirements remain required.

The prerequisite head's CI correctly rejected the Russian chat dictionary at 1,501 lines. Existing invite translations are now extracted into small modules in all four locales without changing keys or values; 25 locale checks, focused strict lint and the production bundle pass. See ci-membership-locale.md. Continue the full Follow membership workflow and every other open criterion; exact-head CI remains required.

Follow membership/preferences slice: bounded raw dialog listing, typed selectors, read-only exact-account plans, reviewed joins/leaves and independent mute/archive phases now share CLI/default text/binary Lino API/common React controls. Durable flushed intents, per-call SDK retry disabling, real Lino reopen protection, scoped preview cancellation and owned queue-deadline handling have focused regressions and production Chromium/MCP desktop/mobile evidence; see follow-telegram.md. FL05 is implemented. FL03 still requires corrections to existing shared Chat/Operator leave acknowledgement paths; FL04/FL06–FL09 and every other open issue-wide criterion remain required. All five CI workflows passed for b6e497e6; the next exact-head matrix remains required.

FL03 shared leave correction: exact channel/basic-group acknowledgements and boolean destruction receipts now preserve local history on unknown results, retain earlier confirmed inactive-channel leaves and block uncertain repeats in the open shared dialogs. Shared joins/leaves/preferences disable SDK automatic retries. Eighty focused checks, finite failing-before receipt/retry probes, production Chromium before/after plus existing channel-management compatibility, and independent MCP desktop/mobile pass; see shared-leave-receipts.md. FL03/FL05 are implemented. FL04/FL06–FL09, broader lifecycle/replay ownership, all other unchecked issue-wide requirements and exact-head CI remain required; PR 57 stays draft and unmerged.

FL04 migration: literal bounded Follow `.env` import now shares verified user identity and persistence with the existing owned phone/2FA/QR flows. Finder Connect freshly verifies before replacement, masks every public phone, retains prior credentials on refusal or changed account, guards duplicate/malformed UI responses and owns verification plus phone factories through shutdown. Focused login/finder/route/lifecycle and locale checks, failing-before probes, production Chromium and independent MCP desktop/mobile evidence are in legacy-follow-sessions.md. Continue FL06–FL09 and every other unchecked issue-wide criterion. PR 57 remains draft and unmerged.

CI update: 2ccb4b45's WebKit job was cancelled at 05:30:18 UTC after successful export; the aggregate reports `e2e-browser: cancelled`, not an assertion failure. Branch job concurrency and newer 5cc23d06 runs are consistent with supersession. The newer 5cc23d06 completed all five workflows successfully. Preserve exact-head verification for the next migration commit; the cancelled preceding matrix is not a pass.
