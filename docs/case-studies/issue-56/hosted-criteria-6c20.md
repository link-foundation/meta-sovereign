# Four complete contract reviews at 6c20f4dc

The contract review accepts **QA12, QA14, QA15 and VD09** at
`6c20f4dc7d8c4b3f0221f88068ab9bac5fd19e51`. The inventory now has
**82 verified criteria and 36 unchecked criteria**. Every unchecked requirement
remains required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which remains draft and unmerged. Historical progress notes retain their dated counts.

## Current hosted execution

All five workflows complete successfully on the selected source:

| Workflow                 | Run                                                                                                             | Result                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Checks and release       | [44113259248, attempt 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44113259248/attempts/2) | All runtime partitions and eight browser partitions pass.                           |
| Desktop release          | [44113259106](https://github.com/link-foundation/meta-sovereign/actions/runs/44113259106)                       | Five native build/launch jobs pass. PR publication intentionally skips.             |
| Deploy to GitHub Pages   | [44113258985](https://github.com/link-foundation/meta-sovereign/actions/runs/44113258985)                       | Build and browser verification pass; default-branch deployment intentionally skips. |
| Scheduled security audit | [44113259274](https://github.com/link-foundation/meta-sovereign/actions/runs/44113259274)                       | Successful.                                                                         |
| Broken Link Checker      | [44113259077](https://github.com/link-foundation/meta-sovereign/actions/runs/44113259077)                       | Successful.                                                                         |

The final responses record 78 jobs: 72 successful and six intentionally skipped
release/deployment jobs. No test or native build is skipped. The original main
attempt had three macOS jobs that never acquired a runner. Their preserved
annotations say “The job was not acquired by Runner of type hosted even after
multiple attempts”; each has no steps or runner name, and its execution log
endpoint returns 404. Retrying failed jobs at the same source completes all
three without a source, assertion or deadline change. This establishes a
runner-allocation failure for those jobs; unrelated historical timeout causes
remain unconfirmed in their separate reports.

## Behavior and evidence reviewed

| Criterion | Complete contract mapping                                                                                                                                                                                                                                                 | Exact-source execution                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA12      | [Salary context](salary-context-criteria-audit.md): independent currency, basis and language; incoming-only relevant history; bounded clarifications; lazy vacancy context; current amounts and preserved personal wording; CLI, both Lino encodings and shared controls. | 120 named checks from twenty files and 28 exact semantic browser receipts. Both engines retain owner drafts and saved rules, refuse stale context and send zero texts. Linked vacancy evidence performs one owned read; observed-card evidence performs zero linked reads.                                                                                              |
| QA14      | [Offered answers](option-choice-criteria-audit.md): strict exact options, accepted summaries, delayed controls, private draft ownership, clear/retry, repeated-answer rejection, HH generic-chip exclusion and guarded native receipts.                                   | 88 named checks and fourteen mandatory browser scenario records. Each engine verifies sixteen control cases, three summary cases, six watcher cases, twenty provider cases, 28 HH cases and eleven visibility cases. Chromium unread selection has one native choice and a held ordinary draft; WebKit explicitly refuses unsupported inactive focus with zero effects. |
| QA15      | [Numeric salary options](salary-band-criteria-audit.md): numeric intervals, whole-decision currency and independent basis guards, current targets, compatible saved baseline, unique automatic containment and reviewed nearest form proposals.                           | 53 named checks and fourteen semantic native records. Both engines verify positive acknowledged choices, zero-effect ambiguous/overlap cases, recovered radio/select receipts, unchanged owner comments and zero form submissions.                                                                                                                                      |
| VD09      | [Desktop packaging](desktop-packaging-criteria-audit.md): downloadable packages, installation, operation without a developer account, complete release gating, checksums/provenance and unsigned first-launch guidance.                                                   | 25 named checks, five real visible protected packaged windows with healthy backends and drained shutdown, Windows installation/uninstallation, four Mac signature checks, fourteen package checksum records and five inspected native screenshots.                                                                                                                      |

The QA12/QA14/QA15 source audits bind eighteen/thirteen/eleven historical
archives to this published source. The complete earlier behavior reviews and
later source comparisons are retained. Mapped production modules are unchanged
from the previously reviewed `06953e31` source and remain unchanged at local
`2329a48b`. Historical whole-file CLI/locale deltas are context, not claimed as
independent new regressions. Each checked hosted archive preserves actual raw
logs, source bytes, named-test line numbers, semantic receipts, original pinned
reference responses and their Git blob hashes.

Desktop provenance names merge `0c662a90`, whose parents are default
`1dc57835` and selected head `6c20f4dc`; its tree equals the selected head tree.
Five bounded reads preserve 5,548 bytes of checksum/provenance metadata.
Large installers were executed on hosted runners and were not downloaded to
the user's machine. The review validates recorded checksum metadata and ZIP
catalogs; it does not claim independent hashes of installer bodies.
macOS uses ad hoc signing without notarization and launches ARM64 natively;
an Intel-native launch is not claimed. PR update-channel warnings do not imply
a published release or clean updater console.

## Reproducible evidence

Run the four existing `collect-*-hosted.py` collectors with revision and slug
`6c20f4dc` after preserving the five workflow responses and assigned raw logs.
They pass and produce checked archives:

- [QA12 archive](data/salary-context-hosted-6c20f4dc.tar.gz)
- [QA14 archive](data/option-choice-hosted-6c20f4dc.tar.gz)
- [QA15 archive](data/salary-band-hosted-6c20f4dc.tar.gz)
- [VD09 archive](data/desktop-packaging-hosted-6c20f4dc.tar.gz)

Each adjacent `.tar.sha256.json` lists every archived byte hash. The collectors
retain `acceptance: false`: their integrity assertions do not make the manual
contract decision recorded here. The [review evidence](data/criteria-review-6c20f4dc.tar.gz)
preserves the final workflow responses, collector outputs, prior allocation
failures and this review separately.

Provider fixtures use isolated native DOM and the production server/adapter.
No personal browser profile or authenticated provider is touched. Unsupported
capabilities remain unavailable. QA13 discovery/application guidance, complete
unread orchestration, persistent manual login, broader CV workflows and desktop
execution/configuration retain their own unfinished acceptance criteria.
The new independent-policy, appearance and HH profile/cookie checks still
require hosted execution at their subsequently published source.
