# Extract documentation gates from the release workflow

Checks run [44105002455](https://github.com/link-foundation/meta-sovereign/actions/runs/44105002455), created
2026-11-17 14:36:40 UTC, tests published source `9846a82708c37e9baa5620f355ce11e68a8c5e56`.
Its file-limit job `134115587678` reports 1,506 lines against the unchanged
1,500-line gate at raw log lines 380–382. The runtime archive exclusion added
eight workflow lines to an already nearly full file. Dependent runtime/browser
jobs were skipped; this run supplies no verification of those changes.

The two existing documentation validation bodies now live in
`js/scripts/check-doc-line-limits.sh` and `check-required-docs.sh`. The same two
named steps call them with Bash. Their bodies, 2,500-line documentation limit,
required-file list, job conditions, dependencies and five-minute deadline are
unchanged. The release workflow is 1,458 lines. No CI check or partition is removed.
This follows the file-limit gate's instruction to extract a focused module.

`python -B experiments/issue-56/ci-workflow-modules.py` runs the actual file-limit
script against an isolated tracked workflow: the published 1,506-line source
fails and the extracted source passes. It also compares each old inline body
byte-for-byte with its helper body, then compares exit status, stdout and stderr
for six finite documentation fixtures: 2,500/2,501 lines, a filename with a space,
a larger non-Markdown file, complete required files and a missing required file.
Every comparison passes. The fixture owns a temporary Git repository and removes
it on completion. It neither scans the owner's documents nor changes the app.

The checked archive retains the exact hosted failure and metadata, original
workflow, new helpers, replay and focused validation logs. Exact new-head hosted
completion remains required. All forty unfinished inventory criteria remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which stays draft and unmerged.
