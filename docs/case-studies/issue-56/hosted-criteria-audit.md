# Original requirement acceptance audit

The source and evidence audit concerns twelve candidate criteria in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
Acceptance is pending until all five workflows finish successfully on the
published source being audited. The
[active plan](hosted-criteria-plan.md) retains that gate and the unresolved
earlier VK24 reload investigation. No inventory row is completed by this draft.

Published `9d31c3e7` passes the native Windows long-path comparisons, while its
publication helpers still contain the independently reproduced
[two-panel selector failure](ci-publication-panels.md). Select the next published
source containing the scoped helper correction for the complete five-workflow
gate. Parent `bf15f721` fails the same four
[experience publication checks](ci-publication-long-paths.md) in all three
Windows runtimes, so it cannot complete acceptance. No criterion is accepted
until the original behavior mapping and all five exact-source receipts pass.

Earlier published `cb95c654` passed its desktop,
Pages, security and link workflows, as well as all eight browser jobs. The
main workflow failed solely because its second macOS Deno partition never
acquired a hosted ARM runner. An isolated retry on the identical SHA failed
before any test step for the same capacity reason. See the retained
[runner allocation investigation](ci-macos-capacity.md). No individual job or
earlier successful revision substitutes for the full gate; select the next
published corrected source for acceptance. These historical results do not
replace the current source's receipts.

## Original behavior and implementation

The complete pinned VK standalone scripts, runner, trigger executor, state
store and desktop requirements were read. The source revisions remain
`konard/vk-bot@175d2d13218d9e791ae2f3e824a0d24f10319dcb` and
`konard/vk-bot-desktop@8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`.
Native method schemas remain pinned at
`VKCOM/vk-api-schema@333481bd082ad747d4873ef4a77f9247097eeef0`.

The complete [questionnaire mapping](questionnaire-criteria-audit.md) adds QA09
and QA10 against `konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`.
It covers whole and aligned component preservation, saved-answer indexing,
explicit offline backfill, independent component salary/contact context and
review-only assembly across shared chats, native applications and forms.
The later observed-form learning and native approval/context corrections retain
their actual-parent failures. The other history, application and CV criteria
retain their separate original scope.

| Criterion | Complete behavior mapping and regression evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VK23      | [Discovery](vk-discovery.md) retains mutual-ranked suggestions, configurable finite community-member windows, deactivated incoming-request rejection with its specific native receipt, and friend/incoming/outgoing inspection. The source `outgoing-messages.js` implements delivery pacing; its behavior maps to the [shared queue](vk-message-queue.md), rather than a separate inspection command. Disabled policies, protected IDs, original profile filters, capacity, daily allowance and native pauses remain enforced. The actual parent lacks `discoverySnapshot`; the current focused tests cover all native reads and positive/negative receipts, CLI, both Lino forms and four-language controls.                                                                                                                                                                                                                      |
| VK25      | [Sticker catalogs](vk-stickers.md) cover active purchased packs, keywords, all greeting IDs, positive per-sticker permission, received attachment filtering and exclusive bounded metadata downloads. The pinned scripts download JSON metadata and preview URLs; they do not download artwork binaries. The implementation preserves that contract and every matching greeting ID. Parent capability/UI regressions, failed saves, incomplete/changing native catalogs, causal reopen, CLI, both Lino forms and four-language controls are retained.                                                                                                                                                                                                                                                                                                                                                                               |
| VK26      | [Per-peer trigger receipts](vk-trigger-state.md) advance only after successful drafting and durable acknowledgement. [First-live history](vk-live-history.md) establishes the newest 100 native messages before admitting each new peer's live trigger and suppresses historical replay. The [FIFO queue](vk-message-queue.md) shares read/typing/text/sticker timing across the reviewed runner and personal policies, exposes configuration and truthful bounded inspection, and drains on Stop/shutdown. [Foreground owner replacement](ci-vk-queue-lifecycle.md) preserves later explicit commands after a prior owner closes. Actual-parent failures retain four duplicate triggers, one instead of 100 context messages, a missing native read acknowledgement and four existing CLI failures. None of the persisted inspection records rearms work.                                                                          |
| VD08      | [Live diagnostics](live-diagnostics.md) share one bounded structured redactor across file/stdout and the cursor-based memory tail. Known nested secrets, accessors, cycles, long token forms, line/byte bounds and polling self-exclusion retain actual-parent and portable regression evidence. The read-only CLI and both Lino encodings retain origin/passcode admission, cancellation and disposal. Four-language Settings retain received entries through visible failures, bounded backoff and copying of exactly visible text. The [desktop clipboard bridge](desktop-clipboard.md) requires its live owned main frame and origin; [the asynchronous correction](desktop-clipboard-async.md) waits for native completion and catches refusal. Parent/native/MCP screenshots and raw records are retained. The current hosted real-Electron receipt positively confirms native clipboard readback and foreign-origin refusal. |
| VD11      | [Friend statistics](vk-friend-stats.md) retain the initial count and immutable positively accepted receipts, derive all-time/current-month/current-week UTC totals, write the three scoped Lino projections without rewriting historical periods and show summaries after actual acceptance in VK, Chat and Operator. The actual parent loses one acceptance after a relationship overwrite. CLI, both Lino forms, causal reopen, failed projection repair and four-language shared summaries retain regression evidence. Unknown and outgoing-request receipts cannot increase accepted totals.                                                                                                                                                                                                                                                                                                                                    |
| VD12      | [Priority seeding](vk-friend-priority.md) reads the complete bounded current outgoing list, merges owner priorities, exposes inspection and separately confirmed clearing, and never issues a friendship mutation. The actual-parent regression lacks seeding. Both Lino forms and CLI own their resources; concurrent seed/clear/shutdown and failed acknowledgements preserve the current list. Later [legacy list handling](legacy-priorities.md) also accepts bare-key empty/scalar saved lists across all friendship guards, while new writes stay strict. Four-language controls preserve unrelated unsaved fields.                                                                                                                                                                                                                                                                                                           |
| VD13      | [Token acquisition](vk-token.md) uses the exact standalone OAuth redirect, constrained ephemeral Electron window, token-only capture, read-only identity/permission/message inspection and acknowledged encrypted saving after fresh replacement consent. Capability refusals preserve the previous token; no-message access remains visible. CLI, both Lino encodings and four-language controls avoid credential echoes and restart replay. The [entry readiness](vk-token-electron-entry.md) and [browser registration](vk-token-registration.md) regressions retain their actual failures. The current Linux x64 job positively ran the real Electron fixture and confirmed native main-frame capture, isolated preferences, destruction and cleared cookies. HTTPS was intercepted locally; no live authorization grant or host kernel sandbox enforcement is claimed.                                                         |
| VD14      | [Runner session logs](runner-log.md) persist independent private redacted files for successful and failed startup/shutdown, default to verbose with explicit CLI/environment/persisted opt-outs, and retain trigger checks, completion and elapsed milliseconds. The actual parent cannot retain an invalid-port startup session. CLI, both Lino forms and four-language diagnostics expose acknowledged preferences and finite full-log downloads. Aggregate log failures cannot erase session evidence; download and metadata never reveal arbitrary files or provider secrets.                                                                                                                                                                                                                                                                                                                                                   |
| VD15      | [Message defaults](vk-message-defaults.md) retain the ten original invitation texts and ten birthday texts, frozen random selection, owner catalog preservation and disabled schedules. Actual-parent tests find one default instead of ten. CLI, both Lino forms and four-language controls expose the catalog; explicit Reset changes only the visible draft, Undo restores it, Save requires acknowledgement and failed saves retain the draft. The restricted-content marker remains invitation-only.                                                                                                                                                                                                                                                                                                                                                                                                                           |

These behavior records contain focused parent/current runtime checks, mandatory
native browser scenarios, independent Playwright MCP receipts and before/after
screenshots. Fixtures are synthetic. Existing completed features retain their
behavior; no automatic policy is enabled by reading or upgrading configuration.

## Evidence integrity and later source changes

`python -B experiments/issue-56/audit-hosted-criteria.py REVISION` streams 24
existing archives, checks every entry against its committed SHA-256 manifest
and records the selected published production source hashes and their differences.
It does not extract archives or run a local test matrix. All 1,693 entries pass,
including the runner confirmation, live diagnostics/clipboard and six
questionnaire archives. The early questionnaire archive's declared source
hashes match the exact bytes recovered from its published implementation commit.

The reviewed later changes include legacy empty-list normalization, provider
friend-status reads in official-size chunks, the drained foreground queue
replacement, native timestamp parsing, historical-event suppression, default
catalog controls, trigger diagnostics, shared cache/command transport, desktop
configuration/TLS/clipboard integration and newly owned CV services. The queue,
discovery, live-history, catalog, token-validation and statistics core contracts
remain intact. The archived full source differences make this comparison
reviewable instead of treating old test output as current-source proof.

The latest transport change bounds local and SSH commands, escalates a child
that ignores cancellation and retains ownership until its close event. Its
timeouts preserve unknown outcomes and do not replay provider effects. The
portable desktop-validator correction loads Playwright only in the guarded
native launch path. Neither change alters the ten feature contracts.

The latest source comparison also reviews the questionnaire learning,
matching, indexing, approval and context deltas. Existing whole answers,
deterministic frequency ordering, scope/correction guards and mandatory derived
review remain intact. The publication-owned Git long-path option concerns a
separate CV operation and does not change these twelve contracts.

The later [runner confirmations](runner-feedback.md) change the shared Settings
surface after an explicit positive Start/Stop receipt. They do not complete the
remaining desktop execution requirements. The refreshed source audit includes
their archived sources, and the acceptance collector now requires their nine
portable checks and all five shared token/runner scenarios on each browser
engine. The collector also requires the live diagnostics and clipboard portable
checks, both mandatory browser scenarios and the native Electron clipboard fields.
Earlier `a493e1cf` has a [Windows private pause checkpoint timeout](ci-lino-pause.md)
without phase timings. The `b61cf5fd` matrix passes that checkpoint but fails
the [CV experience fixture](ci-cv-experience-page-errors.md). The later
`b558bd74` passes the CV inspections and real packaged macOS launch, but fails
the portable desktop validator before six Deno shards can execute. These
negative records remain preserved. Current passing checks do not establish
the unwitnessed historical timeout or cache-failure causes.

## VK24 cache/export mapping and historical diagnostic limit

The [earlier WebKit failure](ci-vk-cache-reload.md) has no witnessed cause.
Its original raw job and browser artifact both show the same undefined-cache
assertion after a successful refresh/export. The browser artifact contains no
request payload, refusal receipt or screenshot of that failed action. The
later diagnostic verifies positive receipts and retains those fields on a
future refusal. Passing local or hosted reload checks cannot establish why
that earlier request failed. The original issue explicitly requires diagnostic
output when there is insufficient data to find a cause; it does not require an
invented explanation before evaluating the requested cache/export behavior.

The [feature mapping](vk-cache.md) covers all seven pinned scripts: bounded
history loading, Markdown conversion with quoted replies and profile links,
account-scoped history/conversation/friend/profile/count caches, the original
age policies, complete zero/empty receipts and offline inspection. The actual
parent lacks the command and controls. Fifteen portable regressions verify
durable paging, credential/account/head changes, failed acknowledgements,
causal reopen, corruption refusal, CLI, both Lino forms, shutdown ownership
and translated controls; twelve existing export checks retain the shared
writer's bounded Markdown and original structured data. Current helper changes
preserve these contracts. Acceptance additionally requires positive named
portable receipts and the complete 401-record export/reload scenario on both
engines in the audited source's successful five-workflow matrix. VK24 remains
unchecked until that gate passes. Retain the historical investigation and
its unknown cause even after feature acceptance.

All other unfinished requirements retain their full scope in this single PR.
PR57 remains draft and unmerged until the whole issue is verified.
