# Current salary-target contract (QA13)

QA13 stays unchecked while exact-source verification and its complete provider
workflow requirements remain unfinished. The complete issue remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

The pinned reference is `konard/hh-job-application-automation` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`: the
[README salary contract](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/README.md),
[form requirements](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/docs/requirements/forms-and-chats.md)
and [hourly regressions](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/hourly-salary.test.mjs).
The review includes README lines 639–683 and form requirements B26/B27.
The collector retains the original API responses and verifies their Git blobs.

| Required behavior                                                                                                                                       | Implementation and verification                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current salary targets replace stale plain learned amounts without rewriting personal explanations.                                                     | `question-salary.js` resolves current configuration before saved plain pay. Specific conflicting expanded amounts and authored wording retain review. `question-salary`, `salary-band-safety` and `salary-saved-baseline` cover those distinctions. Native saved-band execution selects the current band once while retaining the stored rule.                                                                                |
| Keep each currency and tax basis independent, including requests for both net and gross.                                                                | `salary-question.js`, `salary-config.js` and `salary-calculation.js` resolve only the selected entry. `salary-both` and calculation tests exercise missing values, both-basis labels, explicit gross and selected calculation methods. The native questions entry awaits actual calculation, rate recovery, policy and both-basis controls.                                                                                   |
| Monthly/hourly amounts and placeholders cannot be interchanged.                                                                                         | `salary-template.js` expands the current target in the selected context; reserved salary placeholders cannot inherit stale profile estimates. `question-substitution` and its controls verify explicit contraction, changed contacts, current currency expansion and retained originals across CLI, both Lino encodings and offline planning.                                                                                 |
| Divide by configured monthly hours, default 160; round hourly upward by ₽500 or five units in other currencies, retaining exact steps.                  | `salary-calculation.js` uses bounded positive hours and currency-specific or explicitly configured steps. `question-salary` and calculation regressions cover decimal hours, exact steps, overflow and unresolved missing units. The current Node log contains all 94 selected named checks once.                                                                                                                             |
| Calculate explicit personal annual progressive tax or company whole-income bands plus payout; round monthly gross upward and use the final band's rate. | The shared owner-configured calculation mechanism is already inventoried as QA27. Tests exercise both schedules, cross-currency thresholds, final rounding boundaries and independent explicit values. No jurisdiction, company tax schedule or automatic legal-rate choice is invented.                                                                                                                                      |
| Use dated primary-source exchange rates and retain actual cache age after failed refresh.                                                               | The shared mechanism is QA28: `salary-exchange-policy.js` opts into bounded CBR refresh, coalescing and failure backoff. Snapshot mode remains the migration default. Native controls exercise delayed-response owner edits, actual dated cache fallback, stale refusal and selected policy without replacing manual settings.                                                                                                |
| Ambiguous money, conflicting currencies/bases, overlapping ranges and missing amounts require review.                                                   | Salary and option planners refuse unsafe automatic selection. `salary-option-contract`, `salary-range-syntax`, `salary-nearest-bases` and safety regressions cover numeric scale and per-basis agreement. [QA15's full mapping](salary-band-criteria-audit.md) retains the broader option contract and reviewed nearest-form distinction. Native safety controls retain zero blocked clicks and one separately valid receipt. |
| A lower explicitly offered pay can guide a reviewed form answer while retaining a separate comfortable rate.                                            | `salary-guidance.js` prioritizes the selected frame's visible introduction, then compatible vacancy pay. `salary-offer.js` reads one positive compatible amount/range; lesson conversion needs an explicit duration. `forms/pay-profile.js` preserves the reference's 168-hour guidance basis independently of the 160-hour target basis. No owner monthly target is rewritten.                                               |
| Keep pay guidance concise, protect owner input and exclude it from answer learning.                                                                     | `forms-pay-guidance` covers the separate comfortable rate, ambiguous visible introduction blocking fallback, mixed currencies and actual learning exclusions. The native form receipt reads back only the selected hourly field, retains the owner-authored pay answer, leaves other fields untouched, closes the owned browser and records zero submissions.                                                                 |

The original contract also requires these answers throughout HH application
forms/popups, chat, vacancy-aware form planning and automatic submission when
all required answers satisfy the configured policy. Those end-to-end provider
paths remain part of QA13 and the associated HH03/HH06/HH07 and form criteria.
Arithmetic or an isolated form receipt cannot establish that complete workflow.
The existing inventory's provider-discovery and automatic-filling gaps remain
unfinished; they have not been removed or reassigned by this audit.

## Evidence and source changes

`salary-targets-evidence.json` selects nine historical implementation archives.
At source `06953e31`, all 208 entries verify; 21 historical source records
changed across 20 current files. Functional review covers salary context and
wording resolution, form introduction priority, learning exclusions and guarded
form prefill. Locale deltas also contain unrelated later form controls; archive
integrity is not a claim that every such control has a new QA13 regression.

```sh
python -B experiments/issue-56/audit-hosted-criteria.py HEAD \
  --names-file experiments/issue-56/salary-targets-evidence.json \
  --output-prefix salary-targets-criteria
python -B experiments/issue-56/collect-salary-targets-hosted.py HEAD SLUG
```

Preserve the five workflow responses as `hosted-verification-SLUG-*.json`, plus
Node and the registry-assigned questions/forms/salary-options browser job logs
as `hosted-SLUG-TAG.log`. The collector requires every workflow and selected
job to succeed at one exact SHA, 94 named portable tests, complete native entry
success in both engines and six semantic form/salary receipts. It binds the
selected production source to the historical archives without running a local
matrix. Its checked archive retains `acceptance: false`.

The `06953e31` WebKit question-controls aggregate deadline is a recorded failure
and cannot pass this gate. Its [independent budget correction](ci-salary-browser-groups.md)
retains every scenario and deadline. Require all exact-source hosted evidence
and the unfinished provider workflows before changing QA13's inventory state.
