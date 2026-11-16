# Approved wording and final-period contract audit

This maps QA11 to all four approved-wording tests and all nine final-period
tests in `konard/hh-job-application-automation` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`. The pinned
[wording contract](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/answer-preferences.test.mjs)
and [period contract](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/answer-variants.test.mjs)
are studied for behavior, without copying or running their implementation.

QA11 concerns reuse of stored answers and their observed frequencies. Provider
history acquisition, arbitrary semantic inference, unread orchestration and
complete application execution remain separately required by the inventory.
Synthetic native provider pages verify the actual browser adapters; they do not
establish access to a personal account. This document alone accepts no criterion.
Require all five successful workflows for the same published source and the
positive named and browser receipts described below.

## Approved wording

| Pinned contract                                                                                                                              | Shared implementation and required evidence                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicitly approved availability spellings resolve to the preferred text; two and three actual uses combine to five.                         | Owner-declared, question-scoped `equivalents` in `question-equivalents.js`. `question-answer-equivalents.test.js` verifies a zero-use declaration plus actual observations, raw preservation and bounded evidence. Approval is explicit and never inferred from frequency.                                                                                           |
| Other questions, one-month and two-to-three-week commitments remain literal. Closed office/timing consent remains valid.                     | Exact-question and source/chat matching precede projection. `question-answer-equivalents.test.js` checks unrelated questions and commitments. `question-availability.test.js` checks open timing, closed consent, unrelated performance/situation questions and four languages across HH, Telegram and VK planning.                                                  |
| An unrelated performance reply cannot become the availability answer or inflate its history frequency.                                       | The shared bounded timing guard runs in planning and learning. `question-availability.test.js` verifies four actual archived uses, excluded irrelevant text, unchanged messages and idempotent repeated learning. This guard recognizes explicit timing wording; it is not a general relevance classifier.                                                           |
| Saving/loading applies the declaration only to its matching question; editing preferences reloads, and absent aliases define no replacement. | `question-equivalents-controls.test.js` exercises actual CLI saves and reads, an edited Lino rule file, removed declarations, fresh previews, offline acknowledgements and both HTTP encodings. Different questions and raw alternative strings remain separate.                                                                                                     |
| Lists of selected values stay literal rather than being split into alternate answers.                                                        | The shared data model stores a selected checkbox set as a literal multiline answer, separately from the rule's alternative-answer records. `forms-answer-plan.test.js` verifies explicit selected labels, separate radio groups and ambiguous/disabled refusal. Projection operates on whole answer strings, never on individual labels or inspection option arrays. |

The application does not install the reference author's personal availability
answer as a default. An owner saves the equivalent wording through the existing
shared editor, CLI or API. The reference's flat private preference file becomes
explicit stored declarations. Its standalone database format is not a second
storage engine: Link-backed records retain raw observations, and the candidate
projects the preferred wording. This preserves the requested behavior and the
issue's shared storage requirement without silently rewriting history.

An explicit canonical correction remains a separate owner action. The policy and
correction tests verify that it replaces stale frequencies without inventing an
observed send, and that conflicting owner corrections require review. Rejected
content remains excluded after substitution. Duplicate evidence, conflicting
declarations, disabled rules and ineligible scopes cannot silently add counts.

## Final periods

| Pinned contract                                                                                                                                                    | Shared implementation and required evidence                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An observed plain/dotted pair defaults to the dotted spelling regardless of order. A lone spelling is unchanged.                                                   | `question-final-period.test.js` verifies both orders, actual counts, both styles and lone spellings. `question-period-scope.test.js` additionally combines eligible independently saved exact rules for the same question.                                                                                                                                                                                                                                                              |
| Other punctuation, case, different amounts and meaningful alternatives remain distinct.                                                                            | The final-period matcher accepts only an existing single-period pair and preserves canonical/approval boundaries. The same portable tests cover ellipses, question/exclamation marks, Unicode punctuation and unrelated questions. Broader punctuation equivalence remains an independently enabled policy, covered by `question-policy.test.js`.                                                                                                                                       |
| Selecting `without` resolves only an observed pair and retains its combined actual frequency.                                                                      | The same planner checks both styles and raw records. `question-final-period-controls.test.js` exercises actual CLI output, acknowledged offline policy and both Lino transports, with no read-only policy mutation.                                                                                                                                                                                                                                                                     |
| Selected settings reach prefill, exact reusable answers and known chat replies.                                                                                    | `forms-period.test.js` verifies standalone planning, actual reviewed application, initial and interactive CLI review, both Lino formats, safe retry and owner-edit refusal. `question-period-workers.test.js` verifies browser inspection, watched draft revalidation, unread planning, saved actions and confirmed ordinary automation delivery through the shared sender fixture. Exact approved reuse remains eligible; unapproved or conflicting observations still require review. |
| First saves retain their literal spelling; later conflict resolution and legacy reads preserve original alternatives. An explicit replacement is owner-controlled. | Shared learning and preview tests retain the raw strings/counts and unchanged transcripts while projecting the selected candidate. Canonical correction controls cover explicit replacement. Migration 23 adds only a policy default; migration 24 validates declarations without rewriting legacy answers or messages. Their tests require idempotence and no partial schema advancement.                                                                                              |
| Standalone workers resolve local settings, environment precedence and missing-file defaults. Invalid settings cannot replace saved data with an empty read.        | The common resolver is covered by `question-final-period-controls.test.js`: explicit flag, environment, selected configuration, working-directory configuration, saved policy and default precedence. Worker and form regressions require validation before provider reads or opening a store; saved-action overrides survive absent command values. Invalid policy/migration/save tests preserve records.                                                                              |
| Normalizing a candidate never rewrites saved alternatives.                                                                                                         | Period, equivalent-wording, scope, archived-learning and migration tests compare the complete original records. The native UI scenarios independently compare stored rules after preview, setting changes, reload and refused save.                                                                                                                                                                                                                                                     |

The reference's first-save/resave distinction is expressed through immutable raw
observation records plus an acknowledged owner correction, rather than an
implicit destructive rewrite of a separate `qa.lino` file. Counts describe
actual observed turns; a new preferred spelling or owner correction starts at
zero. Repeated reading or learning never manufactures new observations.

## Reproductions and native verification

The following records preserve actual-parent failures, focused passing checks,
source bytes or declared hashes, and reviewed before/after screenshots:

- [Final-period pairing and controls](question-final-period.md).
- [Explicit preferred wording and actual counts](question-answer-equivalents.md).
- [Timing relevance and unchanged archives](question-availability.md).
- [Worker configuration propagation](question-period-workers.md).
- [Question-wide eligible counts](question-period-scope.md).
- [Form configuration and request recovery](forms-period-configuration.md).
- [Shared wording fixture isolation](ci-question-wording-fixtures.md).
- [Stable completed watcher observation](ci-period-watch-observer.md).

The mandatory questions browser group awaits all three wording scenarios with
finally-restored rules. Each emits its actual default/configured selection,
frequency, raw preservation, reload/refusal and compact-layout receipt, followed
by group completion. The browser-controls group prepares the actual native HH
composer with `Vietnam`, five uses and zero Send clicks. The automatic-forms
scenario fills the actual field with `English`, five uses,
identical-request recovery, changed-preference conflict and zero submissions.
The independent MCP fixture additionally observes exactly one input event.
All owned resources close in their existing cleanup paths. Independent MCP
probes and their retained initial fixture errors remain separate evidence.

## Exact-source acceptance gate

The source auditor now verifies eight additional archives alongside the forty
previously accepted archives, without extracting them. It compares archived
production bytes to the selected revision and preserves the unified differences.
Later differences require review against the contracts above, even when old
logs passed. The archive manifests also retain the two test-only observer/fixture
corrections; they do not claim a production change or an unwitnessed root cause.

At `55292dc7`, all 48 archives and their 2,769 manifest entries verify. The
717-line additional-source diff has been read completely. Its later changes
retain isolated configuration, exact-question grouping and overlap review;
the form and scope archives have no later production changes. The separate
380-line integration diff from the previously accepted `5a3a2de3` source has
also been read: delivery rechecks, canonical spellings, timing sufficiency,
runner settings and form/HTTP propagation retain the earlier review and raw
storage contracts. These comparisons do not replace current hosted execution.

The hosted collector requires the original nineteen criteria's receipts plus
73 named portable checks in thirteen additional files, including both dynamic
Lino prefill cases. It also requires twelve additional semantic browser receipts
across Chromium and WebKit, mandatory registration and final group completion.
The two pinned reference test files are recovered from their archived GitHub
responses and checked against their Git blob hashes. Five complete successful
exact-SHA workflows, every required job and the matching source audit are
mandatory. Until that gate and manual source review pass, QA11 remains unchecked
and all 41 unchecked original criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
