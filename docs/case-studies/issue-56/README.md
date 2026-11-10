# Issue 56: unified automation and device architecture

Issue: <https://github.com/link-foundation/meta-sovereign/issues/56>. Draft implementation: <https://github.com/link-foundation/meta-sovereign/pull/57>.

The complete scope and open delivery gates are tracked in [PLAN.md](PLAN.md) and canonical requirements R-AA1–R-AA25. The issue asks for complete feature parity with six reference projects, a shared configurable automation model, browser fallback, associative storage/transport, recovery and cross-device operation. Passing an isolated test does not complete those remaining criteria.

## Evidence and chronology

- [forms-model-drafts.md](forms-model-drafts.md) adds optional bounded Claude Code drafts from a selected CV, profile, recent context and approved answers. Reviewed application freezes context, preserves unknown-fact clarification and makes no second model call. Seventy-one Node/Deno checks, production Chromium and independent MCP pass; live provider calls and automatic chat/provider workflows remain unverified or unfinished.

- [forms-review-capacity.md](forms-review-capacity.md) removes arbitrary batch/browser ceilings, adds saved revision-checked capacity through CLI/Lino/localized UI and preserves sequential startup and owner edits. Forty-seven Node checks, 47 Deno tests, production Chromium and independent MCP pass. Automatic prefilling and every other unchecked issue criterion remain required.

- [ci-tutorial-control.md](ci-tutorial-control.md) traces an intermittent WebKit offscreen Email button to missing viewport checks and conflicting reveal destinations. Failing-before unit/browser evidence, 44 Node/Deno checks, focused WebKit and independent MCP verification are retained.

- [forms-configured-resume.md](forms-configured-resume.md) verifies one saved PDF reused through CLI/Lino/local/shared Forms controls, plan-bound revisions, actual byte readback and unavailable-status recovery. Forty-six focused Node/Deno checks, production Chromium and independent MCP desktop/mobile pass. Complete automatic/provider workflows and every other unchecked criterion remain required.

- [forms-answer-learning.md](forms-answer-learning.md) verifies actual planned-page answers learned as unapproved proposals after observed submission completion or a one-minute owner edit. Thirty-nine focused Node checks, eighteen Deno checks, production Chromium and independent MCP desktop/mobile pass. Contact and current-policy guards, native gesture evidence, queued live readback, bounded retries, lifecycle and inspectable journal evidence are retained. Detached watchers and every other unchecked criterion remain required.

- [forms-automatic-capture.md](forms-automatic-capture.md) verifies default-on passive document capture across fast owner navigation, bounded work, honest omission/failure states, opt-out controls and unchanged answer knowledge. Focused Node/Deno, production Chromium and independent MCP desktop/mobile evidence are retained. Confirmed/stable-edit learning and detached watchers remain required.

- [forms-review-journal.md](forms-review-journal.md) verifies bounded captured-page history, saved Markdown provenance, retention omissions, separate file failures, recovery without replay and read-only historical UI through CLI/Lino/four languages. Focused Node/Deno, production Chromium and independent MCP evidence are retained. Automatic page capture and submission/stable-edit learning remain required.

- [ci-forms-effects.md](ci-forms-effects.md) traces the hosted 6.51% duplication failure and consolidates guarded form effects and isolated HTTP/browser fixtures without relaxing validation.

- [ci-links-concurrency.md](ci-links-concurrency.md) preserves three changing GitHub 503 failures and reduces request concurrency without accepting failures or excluding references. Exact-head hosted verification remains required.

- [forms-reviewed-upload.md](forms-reviewed-upload.md) verifies chosen PDF attachment with actual byte hashes, replacement permission, consumed plans and no replay across CLI/Lino/shared UI. Eighteen focused Node and twelve Deno checks, production Chromium, a focused WebKit custom-control check and independent MCP desktop/mobile pass. Configured résumé selection, models, accumulated pages and learning remain open.

- [forms-reviewed-choices.md](forms-reviewed-choices.md) verifies explicit one-click inspection of supported closed and lazy comboboxes, consumed-plan guards and fresh-plan selected application across two origins. Thirty Node checks, ten Deno checks, production Chromium and independent MCP desktop/mobile pass; actual choice readback and zero submissions are retained. Uploads, models, accumulated pages, learning and assignments remain open.

- [forms-reviewed-custom.md](forms-reviewed-custom.md) verifies exposed ARIA textboxes, checkboxes, complete radio groups and single choices with private option ownership and actual selected-state readback. Sixty focused Node checks, twenty-four Deno checks, production Chromium and independent MCP desktop/mobile pass; six selected fields and one cleared peer are confirmed with zero submissions. Unknown menus, uploads, models, accumulated pages, learning and assignments remain open.

- [forms-reviewed-radios.md](forms-reviewed-radios.md) verifies actual native groups, disclosed clearing, affected-answer replacement permission and verified peer receipts through CLI/Lino/localized UI. Fifty-five focused Node checks, nineteen Deno checks and Chromium/MCP desktop/mobile pass. The later custom-control unit extends this foundation; models, accumulated pages and learning remain open.

- [forms-reviewed-prefill.md](forms-reviewed-prefill.md) verifies selected native text/select/checkbox writes with actual readback, explicit replacement, stale-page/knowledge guards and same-plan receipt recovery through CLI/Lino/shared UI. Fifty-one focused Node checks, fifteen Deno checks and Chromium/MCP desktop/mobile pass. The later radio unit extends this foundation; custom controls, models and multipage/submission/edit learning remain open.

- [forms-review-sessions.md](forms-review-sessions.md) verifies persistent isolated read-only browsers, owner edits and manually opened next pages, activity expiry, failed-close recovery and owned shutdown through CLI/Lino/shared UI. Focused Node/Deno, production Chromium and independent MCP desktop/mobile pass. Reviewed prefilling and multipage/submission/edit learning remain open.

- [forms-answer-plan.md](forms-answer-plan.md) verifies shared field proposals using current owner profiles, approved answers and salary rules, with actual provenance, preserved current values and export. Model generation and reviewed prefilling remain open.

- [forms-reader.md](forms-reader.md) verifies bounded accessible native/ARIA and cross-origin form inspection through CLI, text/binary Lino API and shared four-language UI. Focused Node/Deno, production Chromium and independent MCP desktop/mobile pass. The later planning and review-session units above extend this foundation; prefilling and learning remain open.

- [hh-common-history.md](hh-common-history.md) verifies current HH API pagination, durable bounded continuation, honest coverage, actual message direction, shared CLI/Lino/UI controls and guarded text receipts. Focused Node/Deno, production Chromium and independent MCP desktop/mobile pass; browser/unread and wider provider parity remain open.

- [ci-browser-apt.md](ci-browser-apt.md) investigates repeated Pages setup cancellations, preserves complete download logs and verifies a narrowly scoped Ubuntu archive correction. A passing hosted run exposed an unhandled mirror-list file; the follow-up retains priorities and source indirection with a failing-before regression. The replacement hosted Pages run verifies one changed mirror list and actual primary HTTPS package transfers; later current-head assertions remain required.

- [hh-history-learning.md](hh-history-learning.md) verifies shared HH nested-message normalization, actual applicant direction, application barriers, stable repeated-import counts, edit versions and offline metadata migration through CLI/Lino/offline/UI. Thirty-six Node checks, thirteen Deno checks, integrated Chromium and independent MCP pass; full provider history retrieval remains open.

- [question-profile-legacy.md](question-profile-legacy.md) verifies reviewed contacts.lino import, preserved lists and duplicate alternatives, current values, source locations, bounded refusals, separate saving and local overrides through CLI/Lino/offline/shared editors. Seventy-three Node checks, seven Deno checks, the existing production questions browser flow and independent MCP pass. This completes the inventoried QA05 mechanism; broader provider/form requirements remain open.

- [question-shared-profile.md](question-shared-profile.md) verifies revision-checked named profiles, current values across linked automations, local overrides, missing references and learning/typing races through CLI/Lino/offline/shared UI, 81 focused Node checks, nine Deno checks and Chromium/MCP desktop/mobile evidence. Legacy contact import remains required.

- [ci-snapshot-cancellation.md](ci-snapshot-cancellation.md) preserves the exact Windows/Deno handoff failure, a failing-before cancellation ownership regression, cooperative cleanup acknowledgement, 17 Node/eight Deno focused checks and negative local descriptor probes. Exact Windows handle attribution and new-head CI remain required.

- [question-profile.md](question-profile.md) covers explicit contact/selected-CV extraction, conflicting values, per-field evidence and selected draft fields across CLI/Lino/offline/shared profile editors. The next step, [question-shared-profile.md](question-shared-profile.md), adds reusable named profiles; legacy contact import remains open.
- [question-concurrency.md](question-concurrency.md) verifies shared rule/policy invalidation, ordered owner edits and simultaneous CLI policy additions with eight failing-before cases, 38 focused checks, actual Lino/offline controls and production browser retry coverage.
- [ci-export-defaults.md](ci-export-defaults.md) traces the Chromium CI destination race to a late defaults response and verifies the loading fix with a failing-before regression, exact output files, 32 focused tests and before/after screenshots.
- [question-corrections.md](question-corrections.md) verifies explicit owner corrections across rule IDs, excluded mixed historical wording, preserved real counts/versions and decoded private paths through 47 focused checks and CLI/Lino/UI/browser evidence. General fact extraction, concurrent knowledge edits and live imports remain required.

- [question-summary.md](question-summary.md) verifies actual recruiter handovers, four-language labels, zero-count facts and conservative no-reply classification through 42 focused checks, CLI/Lino/shared UI and production Chromium/MCP evidence. Live provider imports remain required.
- [question-lists.md](question-lists.md) verifies whole questionnaires, conditional/code-preserving aligned parts, private incoming link exclusion and reviewed assembly through CLI/Lino API/shared UI, 53 focused checks and production Chromium/MCP desktop/mobile evidence. Live provider imports and the wider question/form requirements remain required.

- [follow-preview-cancellation.md](follow-preview-cancellation.md) closes FL08 pending-review cancellation with five failing-before regressions, 103 focused checks, 13 policy checks, three production Chromium flows and independent MCP desktop/mobile evidence. Together with [follow-vk-cleanup.md](follow-vk-cleanup.md), [follow-read-policy.md](follow-read-policy.md) and the linked earlier studies, the inventoried FL01–FL09 behaviors are verified. Other unchecked issue-wide work remains required. Earlier entries below describe their state at that point in the chronology.

- [auto-follow.md](auto-follow.md) verifies FL07/FL09 bounded automatic rounds across all Telegram/VK provider pairs through CLI/Lino API/shared UI, current membership and independent Telegram preferences, fresh rejected-chat scans, durable unknown-write protection, real Lino recovery, 80 focused checks and browser/MCP desktop/mobile evidence. Broader FL08 remains open.

- [telegram-backlinks.md](telegram-backlinks.md) records reviewed Telegram/VK source and target pairs, real SDK serialization, exact survival receipts, basic-group local-only cleanup readback, explicit channel/supergroup limits and production Chromium/MCP desktop/mobile evidence. Complete FL07/FL09 automation and broader FL08 remain open.

- [legacy-follow-sessions.md](legacy-follow-sessions.md) verifies FL04 literal Follow configuration migration, fresh user identity checks before replacement, masked finder responses and shutdown ownership through CLI/Lino API/shared UI, with focused regressions and production Chromium/MCP before/after/mobile evidence.

- [shared-leave-receipts.md](shared-leave-receipts.md) records exact legacy leave/destroy acknowledgements, preserved partial results/history and shared SDK retry disabling, 80 focused checks, failing-before regressions and production Chromium/MCP before/after/mobile evidence. Broader FL08 ownership and replay policies remain open.
- [follow-telegram.md](follow-telegram.md) records bounded Telegram listing, exact one-use join/leave plans and independent mute/archive outcomes through CLI/Lino API/React controls, durable uncertainty protection, SDK serialization, focused regressions and production Chromium/MCP desktop/mobile evidence. Shared leave and FL04 migration are verified separately; FL06–FL09 remain open.

- [ci-membership-locale.md](ci-membership-locale.md) preserves the membership head's 1,501-line Russian dictionary failure and extraction of unchanged invite translations, with 25 passing locale checks and strict lint.

- [telegram-membership-receipts.md](telegram-membership-receipts.md) records peek/membership distinction, direct/wrapped join receipts, pending/web-view/unknown outcomes, acknowledged mute/archive changes and shared dialog recovery, with six failing-before regressions, 60 focused checks and production browser/MCP screenshots. The complete Follow membership/preferences workflow is verified in follow-telegram.md and shared-leave-receipts.md.

- [ci-greeting-panel-selectors.md](ci-greeting-panel-selectors.md) preserves exact-head browser strict-selector failures caused by the new nested panel, with a failing-before reproduction and both corrected Chromium workflows.

- [telegram-text-receipts.md](telegram-text-receipts.md) records shared receipt validation, durable uncertain text sends, localized Chat/Operator recovery and directory labels, with 50 focused core checks, 22 UI checks and before/after browser evidence. [ci-checkout-fccb2648.md](ci-checkout-fccb2648.md) preserves the unrelated macOS checkout cancellation.

- [ci-catalog-signals.md](ci-catalog-signals.md) preserves the exact-head Windows Deno catalog cancellation failure, pinned runtime source and platform-aware SIGINT/SIGTERM test correction. Nine focused Node/Deno checks pass; the Windows CI rerun remains required.

- [telegram-group-greetings.md](telegram-group-greetings.md) records participant-only private greetings, visible business/account exclusions, frozen per-person review, limits, pacing, shared 24-hour/uncertain-write protection and acknowledged progress through CLI/Lino API/common UI. It includes failing-before startup regressions, focused compatibility checks and production browser/MCP desktop/mobile evidence.

- [telegram-greetings.md](telegram-greetings.md) records positive sticker receipts, the account-scoped greeting catalog and reviewed chosen-target/bot sends through CLI/Lino API/common UI, with focused regressions, production browser/MCP desktop/mobile evidence and the upstream mask-list shape report. The linked group follow-up verifies TG09/TG10.

- [ci-124a2234.md](ci-124a2234.md) preserves the export head's Windows Deno startup failure and midnight WebKit birthday-fixture boundary, with an actual CI image, deterministic failing/passing calendar experiment and focused startup diagnostics. Windows latency remains under investigation.

- [telegram-users.md](telegram-users.md) records provenance-aware participant/history scans, read-only contact previews, separate phone-sharing consent and durable uncertain-write protection through CLI/Lino API/Chat/Operator, with focused regressions and desktop/mobile browser evidence.

- [telegram-export.md](telegram-export.md) records exact chat selection, active/complete migrated history, bounded linked Markdown/JSON, actual media, cancellation and mobile spacing through CLI/Lino API/shared Chat/Operator controls, with baseline regressions, Chrome and MCP screenshots.

- [saved-publications.md](saved-publications.md) records saved Telegram/VK/X routing and credential modes, masked setup, exact confirmed plans, durable receipts/deletion and reload uncertainty through CLI/Lino API/UI, with focused tests and production browser/MCP images.

- [ci-10d06262.md](ci-10d06262.md) preserves all five exact-head workflows and the WebKit short-viewport tutorial overlap, with a deterministic delayed-resize regression, before/after screenshots and synchronous card measurement correction.

- [provider-publications.md](provider-publications.md) records VK wall ownership/lifecycle, Telegram HTML/plain bot and user-session formatting, checked receipts and uncertain transport failures, with 73 focused checks, real Chrome and an upstream CLI dispatch report.

- [ci-2284c2f5.md](ci-2284c2f5.md) preserves all five successful workflows and all 34 Checks jobs, including both browsers, for actual broadcast outcomes and interrupted-write recovery.

- [x-publishing-auth.md](x-publishing-auth.md) records ignored legacy credentials, app-only write refusal, receipt validation, universal OAuth signing and an upstream report, with 71 focused checks and real Chrome verification.

- [ci-df7c0c28.md](ci-df7c0c28.md) preserves all five successful workflows and all 34 Checks jobs, including both browsers, for bounded question-turn matching and archive learning.

- [broadcast-outcomes.md](broadcast-outcomes.md) records false sent/queue states, shared delivery accounting, actual confirmed UI, interrupted-write uncertainty and 47 focused checks with production browser/MCP before/after evidence.

- [ci-23726697.md](ci-23726697.md) preserves all five successful workflows, every runtime and both browsers for the discovery fixture and multilingual recognition correction.

- [question-turns.md](question-turns.md) records bounded question-core matching, reminder ownership, greeting exclusion and insufficient-affirmative review, with failing-before tests and actual CLI/Lino API/production browser/MCP evidence.

- [ci-41af6c6b.md](ci-41af6c6b.md) retains the superseded archive-learning run: 32 successful Checks jobs, cancelled WebKit/macOS packaging and the strict aggregate error, with complete logs and exact commit/timestamps.

- [telegram-optional-capabilities.md](telegram-optional-capabilities.md) records unavailable reaction/login-domain reads in cached HH Operator, independent user-operation capabilities, 41 passing focused checks and a production browser regression with MCP before/after evidence.

- [salary-exchange.md](salary-exchange.md) records explicit primary CBR refresh, normalized currency lots, dated cache recovery, clock-aware delivery expiry, CLI/Lino API/UI and browser evidence. Unattended refresh policy remains open.

- [ci-package-startup.md](ci-package-startup.md) records a packed CLI health/output race, the preserved CI artifact and a bounded failing-before/passing-after regression. The packed installation remains a CI check.

- [ci-node-macos.md](ci-node-macos.md) records repeated cold-run deadline cancellation and an individual startup assertion, two complete native Node shards and bounded startup diagnostics. The individual cause and exact-head rerun remain open.

- [salary-calculation.md](salary-calculation.md) records configurable progressive/company/payout calculations, dated rate snapshots, rounding-boundary and CLI/API/UI/delivery regressions, with production browser and MCP screenshots. Rate fetching/cache recovery and broader reference parity remain open.

- [ci-profile-selection.md](ci-profile-selection.md) preserves the correction run's separate WebKit profile-selection failure and opt-in diagnostics. The focused local scenario passes; no unproven birthday fix or timeout increase is claimed.

- [telegram-capabilities.md](telegram-capabilities.md) records unavailable notification/event requests from cached chat, explicit backend capabilities and recovery, with failing-before/passing-after API and browser evidence.

- [ci-native-rejection.md](ci-native-rejection.md) records the exact-head Rust TCP reset, a deterministic bounded failing-before regression and staged-close correction. The correction run passes Rust and all nine runtime jobs, including the previously timed-out Node/macOS job.

- [question-salary.md](question-salary.md) records independent configured targets, hourly rounding, related clarifications, unique range selection and CLI/API/UI/delivery regressions, with desktop/mobile screenshots. The calculation follow-up adds tax/FX math; rate fetching and full provider/form parity stay open.

- 2026-11-09 09:28 UTC: issue created. Initial issue and PR snapshots, including all three PR feedback endpoints, are in `evidence/github/`. They returned no comments, reviews or required sub-issues at collection; finalization must refresh them.
- Initial research pinned ten repositories, including all six feature references, browser-commander, link-cli, lino-rest-api and formal-ai. The complete downloaded metadata, commit/tree responses and READMEs are preserved in `data/reference-snapshots.tar.gz`, with per-file SHA-256 values in its adjacent manifest. Reference code is inspected outside the working tree and never executed.
- The initial code review found independent headless defaults across five browser entry points. [browser-defaults.md](browser-defaults.md) records the failing-before/passing-after reproduction and first fix.
- The next step added shared persistent visibility preferences and isolated slots. [browser-preferences.md](browser-preferences.md) contains implementation, test and visual evidence.
- [dependency-updates.md](dependency-updates.md) records the complete direct-dependency and CI tool audit, bounded codec experiments, focused checks and reproducible upstream transport reports.
- [lino-http.md](lino-http.md) records the structured HTTP migration, seven failing-before/passing-after cases, explicit JSON compatibility, browser upload verification and the remaining event/socket/native protocol work.
- [lino-events.md](lino-events.md) records the event-stream migration, bounded multiline/Unicode regressions, browser EventSource verification and compatibility behavior.
- [lino-sync.md](lino-sync.md) records negotiated text/binary WebSocket sync and WebRTC signaling/data, explicit JSON compatibility, bounded framing, real browser convergence and the TCP framing/CLI lifecycle and remaining native transport work.
- [lino-native.md](lino-native.md) records the native HTTP/socket migration, production JavaScript interoperability, bounded malformed-frame checks and the remaining native feature-parity limits.
- [recovery-dumps.md](recovery-dumps.md) records scheduled independent text/binary dumps, checked restore, persistent CLI/API/UI controls, lossless storage values and browser screenshots.
- [question-answers.md](question-answers.md) records shared saved rules, bounded matching, profile substitution, evidence-based learning, reviewed delivery and CLI/API/UI controls, with the advanced reference requirements still open.
- [question-policy.md](question-policy.md) records explicit corrections/aliases, rejected wording, optional punctuation equivalence and zero-count completed-questionnaire facts, with CLI/API/UI and browser evidence.
- [question-context.md](question-context.md) records configured context groups, bounded same-chat history, actual vacancy metadata, no cross-choice value leakage and delivery revalidation through CLI/API/UI, with desktop/mobile evidence. Typed salary and form workflows remain open.
- Related merged PR 51's six before/after images were downloaded from its `issue-50-d289f94d6edd` branch, validated as PNGs and visually inspected. They show the runtime-version landing correction, message selection and tutorial spacing conventions. The originals are retained in `data/pr51-screenshots.tar.gz` with verified hashes; they are reference evidence, not this PR's verification screenshots.
- [desktop-builder.md](desktop-builder.md) records the desktop CI metadata failure after updating the builder and the compatibility correction for existing updater installations.
- [ci-transport-regressions.md](ci-transport-regressions.md) records the HTTP migration's remaining callers/fixtures and their focused verification. [chat-layout.md](chat-layout.md) records the shared scroll race exposed by browser CI, with before/after evidence.
- CI run [42595819230](https://github.com/link-foundation/meta-sovereign/actions/runs/42595819230), created 09:45:19 UTC for exact commit `76d16775e84303fecb38d11aedcdc585a0b63893`, failed formatting. Log lines 2203–2210 identify eight raw GitHub JSON snapshots; line 2211 reports formatting errors. The downstream checks were skipped, not passed. The snapshots were formatted in commit `3374762d`. Full logs and job metadata are in `data/ci-42595819230.tar.gz`; this diagnosis must be rechecked on the next pushed head.
- CI run [42598669128](https://github.com/link-foundation/meta-sovereign/actions/runs/42598669128), created 10:08:25 UTC for exact commit `abb10e28ddbadfa2ea623d30b8035a4180f6bb96`, passed formatting but rejected two changesets. Log lines 1202–1208 require exactly one changeset per PR; line 12916 identifies that gate as the pipeline failure. The two release notes were combined without changing their release level or behavior. Full logs are retained locally in `ci-logs/checks-and-release-42598669128.log`.

## Research and open analysis

The source pins are retained in the research archive rather than assuming moving branches remain unchanged. The [granular reference inventory](reference-feature-inventory.md) records the first source pass and partial implementation evidence; exhaustive source auditing and remaining feature verification are still required. The case study will expand each requirement's root cause, alternatives, selected approach, online evidence and validation as implementation proceeds. No unimplemented reference feature is presented as complete here.

Evidence archives can be reproduced with `experiments/issue-56/archive-evidence.py`; collection uses `experiments/issue-56/collect.py`. Archive creation verifies every file against its hash. The original JSON issue body remains readable in `evidence/github/issue-56.json`.

- [Automatic rate policy](salary-exchange-policy.md): shared cache-first preparation, bounded recovery, preserved snapshot defaults and CLI/API/UI evidence.
- [Bounded CodeQL regression](ci-codeql-bounded-regression.md): exact-head all-job success, separate false-positive alert and verified audit evidence.

- [Both salary tax bases](salary-both.md): independently resolved and labeled amounts, 26 focused checks, actual-server browser evidence and current-value delivery guards.

- [Configured placeholders](question-substitution.md): opt-in contact/salary contraction, current-value expansion, policy/context guards and CLI/Lino API/UI evidence.

- [Operator history race](ci-operator-history.md): preserved CI artifact, deterministic late-effect regression and independent history navigation evidence.

- [Owned reader lifetime](ci-reader-lifetime.md): bounded actual-file reproduction, awaited descriptor cleanup and focused Node/Deno checks; the subsequent exact-head Windows matrix passes; see ci-862af4ba.md.

- [CI for 9b718571](ci-9b718.md): six corrected fixture assertions, separate Windows/browser failures and an incomplete Python CodeQL matrix job, with raw logs.

- [Stored-archive learning](question-archive.md): full archive coverage, stable observed counts, bounded metadata/proposals and reviewable CLI/API/UI learning, with before/after/mobile evidence.

- [Exact-head CI for 862af4ba](ci-862af4ba.md): all five workflows pass, including Windows storage, WebKit history and all four security languages.

- [Signaling capabilities](sync-capabilities.md): actual listener status survives discovery, unavailable RTC is skipped and reset closes its owned peer/socket, with failing-before and browser evidence.

- [Multilingual questions](question-language.md): one bounded recognizer, preserved Hindi vowel signs, 30 focused checks and CLI/Lino API/production browser/MCP evidence.

- [CI for 9835c606](ci-9835c606.md): nine runtime jobs expose the same two stale discovery expectations; all other workflows and both browser engines pass. The focused fixture correction passes locally and awaits a new exact-head matrix.

- [CI investigation for 675e65e8](ci-675e65e8.md): exact failure, full logs and focused WebKit selection-observation correction.

- [Follow link discovery and persisted cache](follow-links.md): FL02 CLI/Lino API/shared React controls, provenance, partial coverage and failure recovery.
- [Follow VK group discovery](follow-chats.md): FL01 bounded provider pagination, Telegram hints, member details and recent messages through CLI/Lino API/shared React controls.
- [Follow fixture secret scan](ci-follow-fixture.md): exact-head failure evidence and preserved URL user-information rejection.
- [Requirements formatting CI investigation](ci-requirements-format.md): exact-SHA failure and replacement run.

- [Reviewed Follow backlinks](follow-backlinks.md): FL06 VK-source CLI/Lino API/React workflow, full-window monitoring, durable recovery, acknowledged incoming cleanup and timeout-only read retries, with regression and desktop/mobile evidence.

- [Detached form watchers](forms-detached-watchers.md): real CLI exit, exact-slot reuse, full-minute answer learning, active-writer coordination, bounded saved history and explicit cleanup.
