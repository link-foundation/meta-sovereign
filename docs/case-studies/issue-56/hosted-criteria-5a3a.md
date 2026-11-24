# Nineteen verified original criteria

Published source `5a3a2de367cd455b9a98db73cefef8654a170b6d` passes all five
workflows: [checks](https://github.com/link-foundation/meta-sovereign/actions/runs/43948282580),
[desktop](https://github.com/link-foundation/meta-sovereign/actions/runs/43948282609),
[Pages](https://github.com/link-foundation/meta-sovereign/actions/runs/43948282597),
[security](https://github.com/link-foundation/meta-sovereign/actions/runs/43948282638)
and [links](https://github.com/link-foundation/meta-sovereign/actions/runs/43948282692).
The main workflow has 54 successful jobs and three intentionally skipped
release jobs. All eight Chromium/WebKit shards passed. The last WebKit shard completed
after the earlier continuation reports; those reports did not establish a new
failure on this source.

The source audit verified all 2,336 manifest entries across 40 original evidence
archives. The collector then verified 386 named assertions in 65 published test
files, 60 browser receipts, the native Linux Electron result and the resolved
JavaScript CodeQL report. It preserves eleven raw job logs, all five workflow
responses, the selected source assertions, source differences and pinned
QA08 correction tests. The collector initially used the form subgroup's name
as its final success marker; the published entry emits `e2e-forms-reader` for
every subgroup. Correcting that lookup retains the required actual semantic
receipt and all original assertions.

The checksummed [evidence archive](data/hosted-criteria-5a3a2de3.tar.gz) and
[manifest](data/hosted-criteria-5a3a2de3.tar.sha256.json) are reviewable without
rerunning a local matrix. The archive's `acceptance: false` records that the
collector itself never accepts a criterion. The original-contract review and
the manual receipt review recorded here complete that separate decision.

| Criteria                   | Original behavior and regression mapping                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA01, QA07                 | [Question recognition and factual completed summaries](question-recognition-summary-audit.md)                                                       |
| QA08, QA16, QA26           | [Clean owner corrections, bounded reminders and rejected answers](question-turn-policy-audit.md)                                                    |
| QA09, QA10                 | [Whole questionnaires, components, reviewed reuse and indexing](questionnaire-criteria-audit.md)                                                    |
| QA25                       | [Saved field provenance and factual form reports](form-provenance-criteria-audit.md)                                                                |
| HH23                       | [Reviewed sanitized publication with private originals preserved](cv-publication-criteria-audit.md)                                                 |
| VK23–VK26, VD08, VD11–VD15 | [Discovery, cache/export, scoped histories, runner integration, statistics, diagnostics, clipboard and token acquisition](hosted-criteria-audit.md) |

The manual review checks the actual browser counters and refusal states:
401 cached messages survive reload without provider access; questionnaire
learning creates three unapproved rules with one observation each and one
reviewed submission; model review preserves stale and owner-edited fields with
zero submits; application context and approval fixtures refuse automatic
effects and permit the explicitly reviewed submission. Each publication
scenario preserves private files, has zero provider sessions and never replays
on recovery. The packaged Electron receipt confirms owned-origin clipboard and
isolated ephemeral authorization. Named language, summary, correction, turn and
concurrency assertions are mandatory awaited calls in the published browser
entry; their successful group completion is recorded honestly where no separate
semantic envelope exists.

Provider fixtures are synthetic. The historical VK reload and hosted startup
causes remain unknown, with original logs and bounded diagnostics preserved.
These accepted criteria do not claim completion of separately inventoried
provider acquisition, full workflow orchestration, CV creation/synchronization
or desktop preparation requirements.

The inventory now has **77 accepted criteria and 41 unchecked criteria**. All
41 remain required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which stays draft and unmerged. QA11 is outside this acceptance set; its
final-period and approved-replacement/count behavior remains under development.
