# Windows Node aggregate job exhaustion

Published parent `6b1e9dea102610dc8d50190147d5dd8fcd5c1152` has two distinct Windows
Node failures in Checks run
[43617379351](https://github.com/link-foundation/meta-sovereign/actions/runs/43617379351).
The first job (`132516105839`) reaches the existing ten-second CLI readiness
limit while copying its cold immutable source snapshot. Its complete 8,800-line
log shows copy progress through 856 of 1,710 files at lines 6093–6111 and the
readiness failure at lines 8765–8780. The traces establish incomplete snapshot
copying; the underlying hosted filesystem delay remains unmeasured.

The failed-job retry (`132522363805`) has a different cause. Its annotation says
“The job has exceeded the maximum execution time of 10m0s”. Setup consumes most
of that budget: checkout takes 153 seconds and dependency installation takes
163 seconds. Tests start at 17:18:54 UTC and cancellation reaches them at
17:21:08 UTC, leaving approximately 134 seconds for the complete unsharded
suite. The 4,616-line log records interrupted tests at lines 1079–1087 and
subsequent cancellation errors. No individual assertion failure precedes that
cancellation. Raising individual test deadlines would not repair this cause.

Windows Node now reuses the existing three-way native Node partitioning used
on macOS. Every runtime/OS pair remains covered. Native sharding distributes
every test exactly once; a failing shard still fails CI. The ten-minute job
limit, thirty-second test limit, concurrency of two, and fail-fast policy remain
unchanged. No CLI staging work moves outside its readiness budget. This reduces
the aggregate test work per Windows job; it does not establish that the first
cold-copy delay is repaired.

The finite regression fails on the parent configuration because Windows has
no shards. After the matrix change, both macOS and Windows cases pass. Each
case executes six tiny fixture files across its three shards and checks exact
coverage, then injects one failing file to prove failure propagation. Run it
with `node --test --test-concurrency=1 js/tests/ci-node-shards.test.js`; it does
not run the application test suite.

The original WebKit shard 2 job (`132516105683`) failed while downloading an
action before checkout or tests. Its failed-job retry (`132522363215`) passed
all assigned browser scenarios. That retry's complete 1,619-line log is also
preserved. The other original checks and four companion workflows passed;
the parent run remains non-passing because Windows was cancelled.

The checksummed [`data/windows-node-shards.tar.gz`](data/windows-node-shards.tar.gz)
contains all four relevant job logs, annotations, configuration snapshots and
focused red/green evidence. Hosted checks must pass on the new published SHA.
All 81 original incomplete inventory rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.

## Published verification

All five hosted workflows pass on `6ad826b0e1951e0623654647f6882187e66b857f`. [Checks run 43621364660](https://github.com/link-foundation/meta-sovereign/actions/runs/43621364660) includes successful Windows Node shards `132528902864`, `132528902773` and `132528902960`, all original runtime/OS pairs and all eight browser lanes. Complete job metadata and the five workflow receipts are retained in the subsequent `data/application-confirmations.tar.gz` archive. This verifies the sharded configuration while leaving the original cold snapshot latency beyond the recorded phase traces unmeasured.
