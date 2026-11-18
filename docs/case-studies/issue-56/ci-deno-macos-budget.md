# Deno macOS cold-run budget

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) preserves
[the cancelled job](https://github.com/link-foundation/meta-sovereign/actions/runs/44279116597/job/134720613522)
at source `4114717bd0adf286007f02e8067b9e409f82d03c`. GitHub's annotation
explicitly says the job exceeded its ten-minute execution limit. The preserved
raw log reports 1,280 passed, zero failed and three ignored at line 13,162,
then cancellation at line 13,164. This is a deadline failure without an observed
failed assertion, not a successful complete workflow.

The job began at 10:11:11 UTC. Setup consumed 3m03s before tests began at
10:14:14. That includes Node setup (40s), pinned npm setup (20s), and locked
dependency installation (87s). Test execution then consumed 6m59s before
cancellation at 10:21:13. The six-way partition therefore lacked cold-start
headroom. Neither a hanging individual test nor dependency installation alone
is established as the cause.

The workflow now uses eight complete native Deno partitions on macOS. It
retains the Intel allocation fallback for the second partition, ARM coverage
for the others, all Linux/Windows partitions, locked dependencies, native type
checking and independent failures. The ten-minute limit is unchanged.

Reproduction: the updated existing partition regression fails on the published
six-way workflow with the complete expected/actual partition sets. After the
workflow change, 22 focused configuration checks pass; the native Deno fixture
probe runs eight finite files exactly once across eight sequential child
processes, rejects an invalid partition and propagates a deliberate child
failure. Node intentionally skips that runtime-specific probe; its separate
native Deno execution passes. Full runtime coverage and hosted timing remain
required on the corrected source.

The [archive](data/ci-deno-macos-budget.tar.gz) and
[manifest](data/ci-deno-macos-budget.tar.sha256.json) retain raw logs, job and
annotation receipts, parent workflow, changed source and focused results.
No original acceptance criterion changes: 88 verified / 30 unfinished, with
the PR draft and unmerged.
