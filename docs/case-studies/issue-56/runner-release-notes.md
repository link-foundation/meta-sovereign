# Runner release notes use the existing PR changeset

Published head `adb2c8f1c73927fb3217afa55e84ac7805d023ee` failed
[changeset validation](https://github.com/link-foundation/meta-sovereign/actions/runs/43775039985/job/133004634445)
after its 2026-11-15 23:28:54 UTC push. The complete workflow log records
the two files at lines 19243–19246 and the rejection at line 19247. All its
test jobs passed; the pipeline status failed because this release gate failed.
The later local API and UI commits added two further changesets, so the same
validator locally reproduced the rejection with four files.

Use the repository's existing merge script to preserve every release paragraph
and the highest bump, then retain the established
`.changeset/visible-browser-defaults.md` filename. Update the three new runner
collectors to read that same file. Earlier evidence archives retain the exact
source snapshots from their original collection. Future steps must update the
existing PR changeset rather than add another one.

The unchanged `node js/scripts/validate-changeset.mjs` fails before consolidation
and passes afterward with one minor changeset. No validator, workflow or test
requirement is relaxed. This correction accepts none of the 60 unfinished
reference criteria; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.

The [archive](data/runner-release-notes.tar.gz) and
[hash manifest](data/runner-release-notes.tar.sha256.json) retain the complete
failed-job log, head metadata, four parent release files, merge and validation
logs, resulting changeset and collector.
