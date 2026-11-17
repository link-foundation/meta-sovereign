# Salary-band contract mapping (QA15)

QA15 remains unchecked until the complete mapping below and all five workflows
pass for the selected published source. This audit accepts no criterion by
itself. The complete issue remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Original source and boundary

The pinned reference is `konard/hh-job-application-automation` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`. The complete
[selector](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/src/salary-options.mjs),
[selector regressions](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/salary-options.test.mjs),
[chat-option regressions](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/chat-options.test.mjs)
and README were read. The checked archives retain original API responses and
verify their Git blob hashes, including README lines 765–783.

QA15 covers numeric option selection and its guarded native execution. The
original tests also exercise general literal options, accepted summaries,
delayed buttons, rejected repeats, salary wording and topic inheritance. Those
requirements retain their own QA12/QA14/QA17/QA20/HH criteria. They remain
required; a salary-band receipt does not accept those broader contracts.

## Behavior mapping

| Original behavior                                                                                                                                                                | Shared implementation                                                                                                                               | Regression and native evidence                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse Russian thousands, English abbreviations, grouped amounts, decimal scales and inherited abbreviated endpoints numerically.                                                 | `salary-options.js`: bounded `salaryAmounts`, amount scales and explicit interval separators.                                                       | `salary-range-syntax`, `salary-band-numbers`; parent failures and native/MCP interval refusal and inclusive-boundary receipts.                                                                                                          |
| Resolve explicit question currency before a unique choice currency, then a compatible expanded answer. Keep currencies independent and refuse the whole mixed-currency decision. | `salary-question.js`: context source order and configured vocabulary; `salary-options.js`: whole-choice currency guard.                             | `salary-choice-currency`, `salary-band-currencies`, `salary-band-safety`, `salary-saved-baseline`; watched currency receipt and zero-effect mixed choices.                                                                              |
| Use configured net or gross values; require both values for a contradictory question.                                                                                            | `question-salary.js`: independent `resolveSelection`; `salary-calculation.js`: requested currency, basis and period.                                | `salary-option-contract`, `salary-band-watch`, `salary-band-overlap`; shared and native common-band cases.                                                                                                                              |
| Choose a chat band only when each applicable amount independently has one containing option and both choose the same option.                                                     | `salary-options.js`: per-target overlap guard before common containment; `question-browser-plan.js`: complete approved strict choice admission.     | `salary-band-overlap`, `salary-band-watch`; parent wrong choice becomes zero effects, and a valid watch has one native receipt with zero text sends.                                                                                    |
| A previously saved lower offered band must not override the current target, including scaled and English/Russian boundary labels.                                                | `salary-saved-baseline.js`: salary-only saved wording; `question-salary.js`: current target priority.                                               | `salary-band-saved`, `salary-band-currencies`; native and independent MCP select the current containing choice.                                                                                                                         |
| A specific expanded saved amount that conflicts with a configured target requires chat review. Preserve authored explanations.                                                   | `question-salary.js`: exact saved-amount conflict and personal wording guards.                                                                      | `salary-band-safety`, `salary-band-saved`; zero clicks/sends for the conflict, one explicit readback when the amount agrees.                                                                                                            |
| Without configured contacts, one compatible expanded saved amount can supply the missing baseline; a literal offered answer is not that baseline.                                | `salary-saved-baseline.js`: approved exact single-amount evidence, compatible currency/basis/period, no invented conversions or persistent changes. | `salary-saved-baseline`: two positive parent failures, independent CLI/offline/text-binary Lino previews, native Russian radio receipt and recovered apply with zero submissions.                                                       |
| Missing amounts or currency, gaps, overlapping endpoints, ties, different net/gross picks, foreign currencies and incompatible periods stay unresolved for chat.                 | Shared selection, configuration approval and strict browser admission.                                                                              | `salary-option-contract`, `salary-band-safety`, `salary-band-watch`, `salary-band-overlap`, `salary-saved-baseline`; automatic watch and unread safety controls retain owner drafts and uncertainty.                                    |
| A reviewed form can propose a unique nearest band; any tie or different per-basis choice stays open. Automatic chat still requires containment.                                  | `salary-options.js`: nearest choice per target, then agreement; `question-salary.js`: `contained: false` requires review.                           | `salary-option-contract` covers one target; `salary-nearest-bases` adds independent same-nearest agreement, contained/gap agreement and safety controls. This correction requires its own parent, native/MCP and hosted evidence.       |
| HH/native and external radio/select planning use the same numeric choice without submitting.                                                                                     | Shared `forms/answer-plan.js` and native review session; form proposals preserve mandatory explicit review.                                         | `verifyFormSalaryOptions`, `verifyFormSavedBaseline`, `verifyFormNearestBases`: actual select/radio readback, zero planning effects, idempotent acknowledged retry, preserved owner comment, closed owned browser and zero submissions. |
| Confirmed automatic browser work may select an approved containing option, with existing ownership and delivery guards.                                                          | `approvedBrowserPlan`, watch and sequential unread admission, fresh dispatch rechecks and durable reservations.                                     | Eight `salary-band-watch` regressions cover owner drafts, queued knowledge changes, duplicates and uncertain receipts. Both engine scenarios await native watch, overlap and currency cases.                                            |
| Expose the same planner through CLI, both default Lino encodings and localized controls.                                                                                         | Shared question preview and application/form planning routes, four-language salary controls.                                                        | Surface regressions in `salary-option-contract`, `salary-band-currencies`, `salary-choice-currency`, `salary-saved-baseline`; retained native/MCP screenshots and stored-rule equality assertions.                                      |

The existing `hourlyNet` and `hourlyGross` configuration fields are explicitly
labeled comfortable rates for opt-in vacancy guidance. They are separate from
the owner's monthly target and its configured hourly conversion. Treating them
as an automatic target would change that existing feature. Saved compatible
hourly baseline amounts are used directly, and unrelated missing currency
amounts are never converted implicitly.

## Evidence integrity and later source changes

`experiments/issue-56/salary-band-evidence.json` selects eleven completed
implementation archives. At `9c9c1fc4`, all 660 entries and their manifests
verify without extraction. Thirteen archive/source records differ from their
original production bytes across three files: `question-salary.js`,
`salary-question.js` and `salary-options.js`. The complete 1,539-line delta was
read. It consists of the subsequent recorded salary corrections: independent
basis resolution, saved wording and amount guards, explicit ranges and scales,
whole-decision currency refusal, each target's overlap check, configured
currency vocabulary, choice currency precedence, the saved baseline and unique
per-basis nearest agreement for explicitly reviewed form proposals.
No removed feature was found in that comparison. Archive integrity does not
replace current-source tests or the original behavior mapping.

Re-run the bounded source comparison after each production change:

```sh
python -B experiments/issue-56/audit-hosted-criteria.py HEAD \
  --names-file experiments/issue-56/salary-band-evidence.json \
  --output-prefix salary-band-criteria
```

The hosted collector reuses `hosted_evidence.py` with the existing broader
criterion collector. It requires five completed successful workflow responses,
checks every recorded job conclusion, binds source hashes to one exact Git SHA,
locates each named portable regression once in its successful Node log, and
requires semantic native receipts in both Chromium and WebKit shard 2. It also
checks mandatory registration, the unchanged three-minute browser-check bound,
awaited nested scenarios, recovered form receipts and zero submissions.

Preserve the responses as `ci-logs/hosted-verification-SLUG-*.json` and the Node,
Chromium shard 2 and WebKit shard 2 logs as `hosted-SLUG-TAG.log`, then run:

```sh
python -B experiments/issue-56/collect-salary-band-hosted.py HEAD SLUG
```

A collector refuses missing, skipped, stale, failed or unregistered evidence.
It writes a hash-checked archive with `acceptance: false`; human review of this
mapping and actual source differences remains necessary. No local full suite,
stress test or full browser/runtime matrix is required by these audit commands.

## Pending acceptance

- The [dual-basis nearest correction](salary-nearest-bases.md) and checked local
  evidence are committed; require their exact-source hosted receipts.
- Verify the complete source comparison and semantic receipts for the final
  published source, including all five successful workflows.
- Update QA15 only after its entire contract is verified. Continue every other
  unchecked issue criterion in this same PR.

The historical WebKit workplace source-loading timeout is unrelated to a
salary selection receipt. Its raw failure and opt-in diagnostics remain in
[the dedicated report](ci-workplace-review-trace.md); its cause is unconfirmed.
