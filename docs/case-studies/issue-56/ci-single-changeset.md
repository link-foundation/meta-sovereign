# One release changeset per pull request

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) at
`3badd29a5acbd49ba09f1425133f2efc0f1a001d` failed the
[changeset job](https://github.com/link-foundation/meta-sovereign/actions/runs/43709740907/job/132798716101).
The workflow started at 2026-11-15 11:36:24 UTC, after that commit. The job ran
11:37:24–11:38:51 UTC. Its preserved 496-line log records the two added release
files at lines 469–478 and the exact rejection at line 471:
“Multiple changesets found in this PR (2). Each PR should add exactly ONE changeset.”
The pipeline status job reports this same dependency at lines 358–360; the test,
browser, package, Rust and CodeQL jobs were skipped. Those skips provide no
acceptance evidence. The other completed lint, documentation, workflow,
dependency and native/container checks succeeded. Three ancillary workflows
were already successful when the investigation began; desktop release was
still running.

The wall invitation commit incorrectly added another minor changeset to this
existing PR. Consolidate its complete release paragraph into the existing
`visible-browser-defaults.md` minor changeset and remove the extra file. Keep
the validator and workflow requirements intact. Subsequent atomic feature
commits in this PR must update that same release file.

Reproduce with the existing validator and the actual base/head SHA pair:
`GITHUB_BASE_SHA=1dc578350c2404b4d6aa12b3530cd3459dae2d1a GITHUB_HEAD_SHA=3badd29a5acbd49ba09f1425133f2efc0f1a001d node js/scripts/validate-changeset.mjs`.
This fails with two changesets. After consolidation, local validation finds one
valid minor changeset, retaining all earlier release notes. Run the same exact
SHA comparison again after committing. This metadata correction does not
accept any unfinished issue requirement; the PR stays draft and unmerged.

The checked [raw evidence archive](data/ci-single-changeset.tar.gz) and
[SHA-256 manifest](data/ci-single-changeset.tar.sha256.json) preserve both complete
failed-job logs, paginated job metadata, before/after validator output, actual
parent release-file bytes, the current release notes, collector and this report.
