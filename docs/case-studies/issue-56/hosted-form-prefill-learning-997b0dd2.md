# Shared form prefilling and learning: QA22 and QA23

QA22 and QA23 are verified at
`997b0dd2e1c7297a6ab4db17e7a4421aa1e38094`. The inventory now contains
**86 verified criteria and 32 unfinished criteria**. Every unfinished
requirement remains required in the draft, unmerged
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Complete contract review

The [prefill mapping](form-prefill-criteria-audit.md) reviews pinned
B1/B4–B11/B13/B15/B25–B27 against the common answer planner, native writer,
private profile/PDF/model discovery, challenge waiting, exact document recovery,
time zones and vacancy pay guidance. The whole owner-supplied URL batch is
validated before sequential owned opening and prefilling. Native text, choices,
checkboxes and dates share the chat/application Q/A engine. Current private
contacts expand placeholders; source revisions invalidate stale proposals.
Explicit/saved résumé choices retain precedence. Owner text/files, unknown facts,
protected fields and separate replacement consent survive automatic execution.

The awaited native automatic scenario verifies six applied field receipts,
two actual main/cross-origin PDF attachments, exact contact and time-zone
readback, preserved owner/unknown values and recovery without another write.
It requires zero automated Next clicks/submissions, then independently fills a
later page opened by the owner. The current assertions and common CLI/text-binary
Lino/UI paths were reviewed with the original reproductions and source deltas.

Both native reader groups verify all three conventional private sources. They
read `resume/resume.md`, `contacts.lino` and `profile.lino` without a named profile;
refuse changed source before writing; preserve owner names; verify the native
PDF digest and unchanged causal saved-selection record; and provide full private
résumé model context without replacing unknown or owner facts. All reviews close
with zero submissions. Optional model generation uses an isolated injected
runner; no live-model result is claimed.

The [learning mapping](form-learning-criteria-audit.md) reviews all pinned
B2/B3/B11/B14/B23/B24 requirements, including B23's later stable-edit extension.
External slots have separate persistent profiles and exact browser targets.
The detached worker survives CLI exit, reuses its identity, retains bounded
history and drains on Close/Stop. Learning defaults on and remains optional.
Actual owner edits must differ from their baseline, stay unchanged for the full
production minute and pass readback again after writer admission. A final
submission needs owner gesture plus same-document completion; Next, synthetic
clicks and `requestSubmit()` alone are rejected. Contact placeholders, rejected
answers, incomplete capture, policy changes, bounded queues and partial storage
retain the existing privacy/refusal rules. Learned answers remain unapproved.

Both normal native learning scenarios verify gestures, contact contraction,
unchanged-prefill exclusion, a stable edit before Send and actual Vietnamese
completion on a manually opened later page. They save two answers once, preserve
accurate counts and drain the owned review. Their shortened fixture clock is
complemented by the separate mandatory detached example using the full
production minute: **60,398 ms** in the Chromium lane and **60,451 ms** in the
WebKit lane. Both detached examples explicitly use Chromium CDP. Each verifies
two planned pages after CLI exit, zero submissions before the owner sends,
the same worker, two unapproved proposals counted once, saved history and Stop.

## Exact-source hosted gate

All five workflows start at 2026-11-18 02:01:04 UTC with the same source above.
Their final metadata contains 72 successful jobs and six intentional skips.
The checks workflow succeeds at 03:07:28 UTC after the requested failed-job
rerun. Its initial WebKit HTTP/2 reload and collapsed Follow disclosure failures
remain preserved in [the CI investigation](ci-follow-links-opening.md).
The later local disclosure correction requires its own fresh hosted gate.

| Workflow           | Result                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| Checks and release | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44220122766) |
| Desktop            | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44220122707) |
| Pages              | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44220122694) |
| Links              | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44220122735) |
| Security           | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44220122756) |

The prefill collector binds **148 uniquely named passing tests** across 17 test
files, including both Lino transports, to the successful exact-source Node job.
The learning collector binds **59 named passing tests** across nine files.
Both retain complete original-contract/source audits. Successful registered
browser groups are required in addition to assertion-source review:

| Group                              | Chromium log lines  | WebKit log lines    |
| ---------------------------------- | ------------------- | ------------------- |
| Forms reader/private sources       | 1299–1485 (shard 4) | 1085–1271 (shard 4) |
| Forms answers/current-page prefill | 2740–2877 (shard 2) | 2508–2645 (shard 2) |
| Forms learning                     | 1198–1294 (shard 1) | 990–1080 (shard 1)  |
| Detached full-minute watchers      | 1475–3670 (shard 3) | 1277–3472 (shard 3) |

The [prefill archive](data/form-prefill-hosted-997b0dd2.tar.gz) contains
182 entries; the [learning archive](data/form-learning-hosted-997b0dd2.tar.gz)
contains 76. Every entry is independently rehashed against its manifest.
The collectors reject another source revision, missing/non-passing workflows,
missing named checks, skipped/incomplete browser groups or missing semantic
receipts. Integrity is accompanied by the contract and awaited-assertion review
above. These native isolated fixtures establish the shared accessible form
contract; they do not claim live authenticated provider accounts or complete HH
or assignment orchestration. QA24 and every other unfinished criterion remain
open. Newer prepared commits still require their own hosted checks.
