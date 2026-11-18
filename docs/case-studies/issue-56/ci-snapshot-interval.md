# Verify snapshot intervals independently of hosted disk speed

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Published `4f482c34` fails Windows Deno shard 3 in
[job 132290872116](https://github.com/link-foundation/meta-sovereign/actions/runs/43542772532/job/132290872116).
The complete 5,292-line job log is preserved: lines 5244–5257 report one
snapshot record instead of three in `store-append.test.js:201`.

The test allowed five seconds after observing the first file. The scheduler
deliberately waits at least ten times the preceding write's cost. A 600 ms
write therefore schedules the next snapshot six seconds later. File visibility
also does not establish that the asynchronous writer has settled. The hosted
log does not measure that write cost; this explains and reproduces an invalid
test assumption, without claiming the original runner's precise timing.

Run `node experiments/issue-56/snapshot-interval-probe.mjs`. It extracts the
exact published scheduler and uses a finite virtual clock and writer. At five
seconds the original three-record assertion fails; at six seconds all three
records exist. Explicit flush immediately persists deletion and cancels the
timer. There are three writes, no host sleeps and no remaining timers.

The corrected tests inject the scheduling clock but still create, encode,
fsync, rename, read and decode real snapshot files. They await the actual
writer, verify minimum and adaptive intervals, coalescing, and immediate flush.
The production clock is shared with the existing mirror scheduler. Its default
timing policy is unchanged. Optional count/timing diagnostics are silent by
default, contain no paths or values, and cannot interrupt persistence when a
listener throws. Returning the timer's existing write promise lets the finite
clock await completion; native timers ignore that return value.

All three focused cases pass in Node and Deno, including the throwing diagnostic
listener. Six existing mirror scheduler checks pass. Each new test has a
five-second deadline and at most ten controlled timer turns; no deadline or
duplication threshold was raised. Scoped lint, format, secret and diff checks
pass; duplication is 6.49% against the unchanged 6.5% limit.

The same old run's WebKit shard 1 was cancelled, without a test assertion.
Its complete 1,085-line log and check annotations are preserved. GitHub reports
“Canceling since a higher priority waiting request” for that shard's concurrency
group. The workflow explicitly cancels superseded jobs. Its 35-minute deadline
was not reached; this cancellation is separate from the Windows assertion.

The [archive](data/ci-snapshot-interval.tar.gz) and
[manifest](data/ci-snapshot-interval.tar.sha256.json) retain sources, exact parent,
full hosted logs, annotations, reproduction and focused results. Exact corrected
head hosted checks and all unfinished original requirements remain required.
