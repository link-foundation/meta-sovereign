# Keep Ubuntu Deno within its existing deadline

[Checks run 43689540252](https://github.com/link-foundation/meta-sovereign/actions/runs/43689540252),
created at 2026-11-15 07:20:52 UTC for
`4dca94624c65cb4dd624654baa96cf233483fffe`, cancelled Ubuntu Deno job
`132737990438`. Its annotation explicitly reports: “The job has exceeded the
maximum execution time of 10m0s”. The complete downloaded job log has 9086 lines.
The test step starts at line 2070 (07:27:39); cancellation is at line 9067
(07:35:16), after the friend-job assertions passed. No assertion failure appears
before cancellation. The observed 760 modules span 456 seconds; the largest
module interval is 24.7 seconds for `vk-contextual.test.js`. Intervals include
the next module's startup. This incomplete run establishes insufficient time
for the serial suite after setup, without predicting its full duration or
excluding unrelated failures in later tests.

Ubuntu Deno now uses the same three native `--shard` partitions already used
for Windows Deno. The original Ubuntu/Deno matrix pair is excluded before its
three entries are appended. Every original runtime/OS target, test discovery,
failure propagation and the ten-minute deadline remain mandatory. No tests are
filtered out. No test deadline is increased.

The expanded workflow contract fails against the published parent because its
Ubuntu shard list is empty. With the change, the focused CI contracts and Node
partition probes pass 23 tests with one explicitly skipped Deno-only probe.
Deno passes both partition checks, including the six-file native experiment
that proves exact coverage and nonzero failure propagation. Subprocesses are
sequential, and the Deno fixture heap is bounded to 128 MiB. Full suites remain
hosted checks for the new exact commit.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-deno-shards.test.js js/tests/ci-node-shards.test.js js/tests/ci-contracts.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all js/tests/ci-deno-shards.test.js
python3 -B experiments/issue-56/analyze-windows-deno.py ci-logs/vk-maintenance-parent-deno.log
```

The [archive](data/ci-ubuntu-deno-shards.tar.gz) and
[manifest](data/ci-ubuntu-deno-shards.tar.sha256.json) retain the complete failed
job, annotations, exact-head metadata, observed timings, original workflow,
regression and focused checks. Recollect with
[collect-ci-ubuntu-deno.py](../../../experiments/issue-56/collect-ci-ubuntu-deno.py).
This correction does not complete any unfinished product requirement.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged while all original requirements are implemented and verified.
