# Daily-limit expiry after an acknowledged backup

Confirmed HH waiting now rechecks the saved workspace pause at the original
deadline before admitting a native refresh. Inspection and acknowledged backup
can cross that deadline. Their earlier `active` flag cannot establish whether
the pause is still active. A newer pause from another slot still refuses the
refresh; no deadline is extended or delivery reservation released.

## Hosted evidence and reproduction

Checks run `43600700798`, head `c976dc98`, started 2026-11-14 at 13:37:29 UTC.
Chromium shard 2 job `132465586203` passes the ordinary daily-limit scenario,
then fails the waiting scenario. Its complete 1,847-line log records
`jobs-application-limit-wait` at line 1764, followed by a 10-second review-state
timeout at lines 1770–1789. The 32-file artifact contains the scenario summary,
but no failure screenshot. This is a backend refusal, not evidence that a longer
rendering wait would help. The original runner's exact clock/read interleaving
was not captured.

The bounded regression crosses the deadline immediately after the final
acknowledged answer backup, while the inspected pause still says active.
On published parent `ef99739ba4f2684d7714c456f794caa004dbe41c` (the same wait
implementation as `c976dc98`), the wait incorrectly becomes `refused` instead of
`review`. Run `experiments/issue-56/application-limit-wait-before.py --expiry`.
The second case establishes a newer shared pause before crossing; it must refuse
on both versions. The probe restores all working sources and drains its fixture.
This proves a concrete race capable of producing the hosted refusal; it does
not establish the unrecorded original interleaving.

## Correction and validation

The expiry path uses the existing shared-pause admission check after backup,
then checks current ownership again. It retains the original two-hour wait,
acknowledged actual-answer preservation, synchronous DOM/navigation checks,
separate restoration consent, Stop/drain and unknown-delivery reservations.
An opt-in expiry trace records only whether inspection reported the pause active.
Native wait failure screenshots now honor the existing CI artifact directory.

All 65 focused Node and 65 Deno checks pass. They include the deadline-crossing
regression, a later shared pause, persistence failures, owner edits, changed
documents, CAPTCHA, policies, guarded refresh refusal, restoration consent and
restart recovery. The existing finite production Chromium waiting scenario
passes: one entry, one refresh, three changed-DOM refusals, four locales, phone
layout, later-answer backup, separately confirmed restoration and zero sends.
Owned fixtures close. No scenario, engine, assertion or existing deadline was
removed or enlarged. Scoped formatting, lint, secret checks and the unchanged
duplication gate pass.

`data/ci-limit-expiry.tar.gz` and its SHA-256 manifest preserve the exact-parent
source, regression failures, final focused/native logs, native screenshots,
hosted job log and artifact summary. Every final-head hosted check remains
required. The separate signaling assertion and macOS runtime cancellation
remain under investigation, as do all 81 original unchecked inventory rows.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged.
