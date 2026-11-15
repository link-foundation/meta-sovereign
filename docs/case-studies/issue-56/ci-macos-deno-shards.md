# Keep macOS Deno within its existing deadline

[Checks run 43695582515](https://github.com/link-foundation/meta-sovereign/actions/runs/43695582515),
created at 2026-11-15 08:40:12 UTC for
`b0bb53aef2fd7556baabfbe6f51103659ce25ef2`, cancelled macOS Deno job
`132756355929`. Its annotation explicitly reports that the job exceeded the
maximum execution time of ten minutes. The complete downloaded job log has
11,721 lines; cancellation is at line 11,701 (09:10:19 UTC).

The runner starts at 09:00:06; the first test module starts at 09:02:25.
The incomplete run progresses through 758 observed modules over 473.8 seconds.
The final partial module is `vk-contextual.test.js`, with lifecycle records
continuing until cancellation. No assertion failure appears before cancellation.
Cold action download and checkout fetch account for individual gaps of 58.5
and 37.0 seconds. These observations establish insufficient time for this
serial run, without predicting a full-suite duration or claiming later tests
would pass.

macOS ARM Deno now uses the same three native `--shard` partitions as Ubuntu
and Windows. Excluding the original matrix pair before appending the shards
preserves every runtime/OS target and the unchanged ten-minute deadline.
Test discovery, assertions and failure propagation remain mandatory.

The expanded contract fails against the actual published workflow because
macOS has no shard entries. With the correction, the focused CI contracts and
Node partition checks pass 23 tests, with one Deno-only probe skipped. Deno
passes both checks. Its six-file native probe verifies every fixture executes
exactly once, a failing fixture propagates failure, and an invalid shard is
rejected. Subprocesses run sequentially with 128 MiB heaps. Full suites remain
hosted checks for the new exact commit.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-deno-shards.test.js js/tests/ci-node-shards.test.js js/tests/ci-contracts.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all js/tests/ci-deno-shards.test.js
python3 -B experiments/issue-56/analyze-windows-deno.py ci-logs/vk-desktop-macos-deno.log
```

The [archive](data/ci-macos-deno-shards.tar.gz) and
[manifest](data/ci-macos-deno-shards.tar.sha256.json) retain the complete failed
job, exact-head metadata, annotations, timings, original workflow and finite
regression checks. Recollect with
[collect-ci-macos-deno.py](../../../experiments/issue-56/collect-ci-macos-deno.py).
This correction completes no unfinished product criterion.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged while every original requirement is implemented and verified.
