# Screen Stop after a Docker switch

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The real SSH/Docker fixture at published `802c6168` reached Docker and local
application health, then failed when switching back from local Screen. The
[Linux job](https://github.com/link-foundation/meta-sovereign/actions/runs/44244114712/job/134599157780)
records `Failed to stop docker session … No such container` at log lines 452–453.
Cleanup's assertion at line 462 hid the initial assertion. Its artifact is
preserved alongside the complete job log.

The pinned start-command control implementation looks up a historical execution
by session name and selects that record's backend. On a shared SSH/local host,
this can resolve the previous Docker record even though the current session is
Screen. Adding an isolation flag to Stop cannot fix that lookup: the pinned
query dispatcher passes only the stop timeout to its control handler.

Screen Stop now re-reads native sessions, requires one exact configured name,
sends Ctrl+C to the observed `PID.session` and retains the existing bounded
observation/drain loop. It never asks the historical wrapper to choose a backend.
Duplicate selected names remain unknown. Missing, changed, ambiguous or cancelled
fresh observations refuse the signal. Docker's owned-ID controls stay unchanged.
The hosted fixture prints its initial error before running cleanup.

The separate [workflow contract job](https://github.com/link-foundation/meta-sovereign/actions/runs/44244114712/job/134599157142)
failed at lines 649–655 because the new setup-node step omitted
`package-manager-cache: false`. That step now follows the existing cache policy;
the existing policy regression remains unchanged.

`experiments/issue-56/runner-screen-before.py` selects actual published controller
and observation sources. Four finite cases produce two failures (wrong backend
and duplicate names) and two compatible refusal controls. The repaired sources
pass all 43 focused controller, shutdown, inspection, Docker and cache-policy
tests with one worker. Scoped formatting, lint, secret scanning, source/document
limits, workflow security and the unchanged duplication gate are checked in the
associated source-bound evidence bundle.

Actual hosted SSH/Docker verification is still required. No Docker daemon or
full runtime/browser matrix was run locally. VD02 and the other 31 unfinished
criteria stay unchecked; the PR remains draft and unmerged.
