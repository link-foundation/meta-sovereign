# Salary context contract mapping (QA12)

QA12 remains unchecked until the complete mapping and current-source hosted
receipts pass. This audit does not accept a criterion. All other unchecked
requirements remain active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Pinned reference and scope

The reference is `konard/hh-job-application-automation` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`. Read the complete
[salary question tests](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/salary-questions.test.mjs),
[context tests](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/answer-contexts.test.mjs),
[chat clarification tests](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/chat-salary-clarification.test.mjs)
and [hourly tests](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/hourly-salary.test.mjs),
and their implementations. The original GitHub responses are preserved with
verified Git blob hashes in the selected implementation archives. They define
behavior to learn from, rather than code to copy or execute.

QA12 covers currency, basis, language, relevant context and contextual salary
wording. Numeric band execution has its complete [QA15 mapping](salary-band-criteria-audit.md).
Tax schedules, dated FX refresh and progressive vacancy guidance retain QA13's
broader scope. Persistent all-unread orchestration, generic context groups,
archive learning and actual application submission retain their other criteria.
No salary receipt accepts those broader workflows.

## Behavior mapping

| Pinned behavior                                                                                                                                                                                        | Shared implementation                                                                                                                                                               | Regression and native evidence                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interpret English/Russian expected-pay requests, gross/net aliases and explicitly hourly requests; leave historical pay, offered-pay acceptance, annual pay, payroll cards and unrelated topics alone. | `salary-question.js`: direct intent, exclusions, period and bounded clarification vocabulary.                                                                                       | `question-salary`, `salary-intent-contract`, `salary-vocabulary-contract`, `salary-clarification-contract`; native intent and vocabulary drafts retain owner text and rules.                                                                                     |
| Keep language independent of currency and basis. English requests do not reuse Russian wording; bare currency/basis follow-ups inherit the anchor's language.                                          | `salary-question.js`: `salaryLanguage` and independent selection fields; `salary-wording.js`: language-compatible wording.                                                          | Both-language, fallback and cross-language cases in `salary-both`, `salary-wording-contract`, `salary-clarification-contract`; mandatory polite English and named-number native drafts.                                                                          |
| Resolve the current question's explicit currency before relevant conversation and vacancy context; a missing configured target cannot borrow another currency's amount.                                | `salary-question.js`: explicit selection, source order, unknown-currency refusal; `salary-calculation.js`: resolve only the selected currency entry.                                | `question-salary`, `salary-context-priority`, `salary-template-context`, `salary-choice-currency`, `salary-saved-baseline`; independent CLI/offline/text-binary Lino tests and native EUR/USDT readback.                                                         |
| Currency codes and short words use complete boundaries; longer configured words may match inflections. Blockchain preference is configurable, rather than installed as everyone's personal default.    | `salary-question.js`: literal boundaries, configured stems and `contextPriority`; shared four-language priority editor.                                                             | `salary-context-priority` checks USD versus USDT, symbols beside amounts, stems, explicit override, tied priorities and missing amounts; desktop/phone controls and independent MCP evidence.                                                                    |
| Read employer messages newest first, then the observed vacancy card. Read a linked page only if currency can change the answer and earlier sources do not decide it.                                   | `question-browser-vacancy.js`: captured browser planning, card priority and existing verified vacancy cache; `salary-question.js`: conversation/intro/pay/description source order. | `salary-browser-vacancy` and `salary-browser-vacancy-card` cover manual/watch/unread paths, refusal, cache reuse, unknown/ambiguous currency, changed context and cancellation. Native routed page has one owned read; observed card has zero linked-page reads. |
| Exclude the owner's outgoing answers from salary topic, currency, basis and period. Do not revive an older employer topic through uncertain delivery or invalid chronology.                            | Browser/archive adapters retain direction; salary planning excludes outgoing turns after bounded capture validates chronology and delivery/service barriers.                        | `salary-employer-context`: eight parent failures, archive and browser controls, fresh watched context and model-independent unread planning. Native/MCP reproduce USD then correct EUR, with zero sends.                                                         |
| A short clarification needs the nearest related salary anchor, inherits the latest requested basis and cannot cross an unrelated question or change the pay period.                                    | `salary-question.js`: bounded clarification chain, topic barrier, independent explicit precedence and period agreement.                                                             | `salary-clarification-contract`, `salary-browser-context`, `salary-employer-context`; browser-derived dated history, stale-context refusal immediately before prefill, owner-draft preservation and zero sends.                                                  |
| Net and gross targets remain independent; when both are requested, label both and require both to resolve. No implicit FX or tax method can supply a missing amount.                                   | `question-salary.js`: independent resolution; `salary-calculation.js`: explicit default method and only configured opt-in calculations.                                             | `salary-both`, `salary-both-controls`, `salary-calculation`, `salary-calculation-controls`; missing/stale values, rejected wording, current-setting rechecks and native dual-basis controls.                                                                     |
| The same salary wording expands in the selected currency, including an older currency-specific placeholder, without rewriting personal explanations or unrelated contact placeholders.                 | `salary-template.js`, `salary-saved-baseline.js`, `salary-wording.js`: contextual current values, exact owner wording and explicit contraction.                                     | `salary-template-context`, `salary-wording-contract`, `question-substitution`; all five shared provider identities, actual CLI/Lino/offline paths, exact/equivalent/final-period wording, retained raw counts and owner settings.                                |
| Inference uses stable, detailed, compatible approved wording; learned topic and gross words need multiple distinct salary examples and cannot override explicit basis or exclusions.                   | `salary-wording.js`, `salary-vocabulary.js`: scoped compatible examples, deterministic choice, distinct-question purity and bounded corpora.                                        | `salary-wording-contract`, `salary-vocabulary-contract`; personal-text, rejection, canonical-correction, scope, hourly exclusion and delivery-time knowledge-change controls, plus native/MCP drafts.                                                            |
| Form planning uses each field's visible context and retains review when salary is inferred or its currency is unresolved. A draft must never be counted as a provider delivery.                        | Shared form answer planner, salary guidance, review session and native acknowledgement guards.                                                                                      | `question-salary`, `salary-template-context`, `salary-option-contract` and QA15's native form readbacks; explicit review, no automatic submission, no invented usage counts. Complete application behavior remains in its HH criteria.                           |
| Expose the same behavior through CLI, default text/binary Lino and localized Chat/Operator/Questions controls, without requiring model opt-in.                                                         | Shared question store/planner, browser review/watch/unread adapters, offline client and four-language settings/evidence components.                                                 | Surface cases in the context, wording, vocabulary, clarification and employer-context regressions; mandatory native helpers use the actual server and browser adapter against isolated provider DOM.                                                             |

## Evidence integrity and current execution

`experiments/issue-56/salary-context-evidence.json` selects eighteen checked
implementation archives. The four earliest archives (`question-salary`,
`salary-calculation`, `salary-both`, `question-substitution`) contain raw logs
without production source snapshots. Their passing historical logs are not
presented as proof about current bytes. Later archives preserve the corrected
production modules; the source auditor compares those snapshots with the
selected published revision and records every changed source hash and unified
delta. Current hosted portable and native execution is required separately.

At `06953e31ac283d568d424935923038b3f5bc5060`, all 781 archived entries
verify. Twenty-five archive/source records differ across fifteen production
files. The earlier complete 2,146-line comparison and the subsequent shared
planner/context changes were read. Changes preserve explicit
currency boundaries, configured priority and stems, personal wording, independent
language/basis/period, bounded clarifications, current amounts and saved-baseline
guards. Browser changes share asynchronous captured-context planning between
manual, watch and unread paths, preserve cancellation, use an observed card
before a separate page and exclude outgoing turns only after chronology and
delivery barriers. English/Hindi watch copy accurately includes approved salary
choices. No removed feature was found in this comparison.

The latest shared guard holds identical answer wording after a repeated question
and consecutive sent owner replies, while allowing a different candidate. The
archive planner and fresh browser dispatch use the same owner-direction
predicate, including archived owner identities. This strengthens rejection
handling without letting outgoing text select salary context. Six focused
repetition checks and the mandatory sixth watcher case cover the new behavior.

```sh
python -B experiments/issue-56/audit-hosted-criteria.py HEAD \
  --names-file experiments/issue-56/salary-context-evidence.json \
  --output-prefix salary-context-criteria
```

The mandatory salary context and wording groups await clarification, wording,
vocabulary, intent, templates and context priorities. Their
[independent budgets](ci-salary-browser-groups.md) retain every scenario previously
included in `question-controls`. Clarification additionally
awaits phrasing, named numbers, observed history, stale-history refusal, linked
vacancy, observed card and incoming-employer context. The native helper reads
the actual composer after acknowledged prefill, holds an owner's pre-existing
draft, compares saved rules and closes its fixture. No text is sent by these
salary draft scenarios. Chromium and WebKit must both emit each receipt and
complete every assigned group. The ordinary `questions` group separately exercises salary
settings, calculations, dual-basis output and contextual contraction.

`collect-salary-context-hosted.py` requires 120 named portable checks from twenty
files, fourteen exact semantic receipts per engine and complete browser
groups. The collector reads their actual partitions from the selected source;
the split assigns wording to shard 1, context to shard 4 and `questions` to
shard 3, while retaining the legacy layout for historical runs.
The collector shares archive, test-name and pinned
reference validation with QA15's collector and preserves five verified original
reference responses. It also requires five complete successful workflows at
the selected SHA, including every recorded job conclusion.

Preserve the workflow responses as `ci-logs/hosted-verification-SLUG-*.json`
and the Node plus registry-assigned Chromium/WebKit raw logs as
`ci-logs/hosted-SLUG-TAG.log`, then run:

```sh
python -B experiments/issue-56/collect-salary-context-hosted.py HEAD SLUG
```

Its hash-checked archive retains `acceptance: false`. The complete behavior
mapping, actual raw receipts and current-source comparison require review
before an inventory row changes. No local full suite or browser matrix is run.

These isolated provider pages exercise production server, adapter and native
DOM paths. They do not claim execution against anyone's live account. The
product vision expressly keeps live conversations separate from test fixtures;
an invented live-account acceptance gate must not defer implemented behavior.

## Remaining acceptance work

- Recheck the source comparison if any mapped production module changes after
  the reviewed `06953e31` comparison.
- Bind named portable checks and semantic receipts from both browser engines
  to one published SHA and five successful complete hosted workflows.
- Read actual receipts and any failure logs before updating QA12. Integrity,
  passing CI or an individual correction alone does not accept the criterion.
- Continue all other original unchecked criteria in this single PR.
