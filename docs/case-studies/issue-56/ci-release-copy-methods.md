# Investigate recurring Windows Deno release preparation

[Checks run 43091914519](https://github.com/link-foundation/meta-sovereign/actions/runs/43091914519), created 2026-11-11 at 19:57:05 UTC for `b73f3433`, fails Windows Deno job `130772387445`. The preserved job log has 10,300 lines. Lines 7427–7450 show initial host readiness failing after 10,081 ms, with a missing named pipe. The retained phase trace records CLI command loading at 2,062 ms and immutable release readiness another 6,467 ms later. Of that preparation, copying 1,470 files takes about 5,502 ms; source hashing and copied-content verification each take about 450 ms. The later tamper fixture copies the same source faster, but that does not explain or resolve the initial failure. Final lines 10216–10247 report 4,804 passed, one failed and seven ignored.

The next Windows Deno run executes a finite comparison **after** the real tests, including after a failure, so the probe cannot warm or replace their startup path. It prepares two private snapshots of the actual package: the production `copyFile` method and bounded buffered read/write. Both use the production four-operation limit, complete digest verification and cleanup. Each probe admits at most 4,096 files and 128 MiB; individual buffers are at most 8 MiB. Content and build identities must match. No production copy strategy or deadline changes yet.

Run the reusable probe with:

```sh
deno run --allow-all --no-lock --v8-flags=--max-old-space-size=384 experiments/issue-56/release-copy-strategies.mjs
```

One Linux Node check completes both snapshots with identical digests and 1,470 files / 17,550,144 bytes per method. Copy operations take a summed 2,494 ms with `copyFile` and 3,167 ms with buffering; total stage times are 4,079 and 3,389 ms respectively. Those sums overlap and the second snapshot has warmer source reads. Both methods also include an instrumentation-only source `stat`. These are diagnostic observations, not a Windows result or proof of a faster production strategy. Workflow policy and the focused CI contracts remain required checks.

The [evidence archive](data/ci-release-copy-methods.tar.gz) retains the raw Windows failure, exact SHA metadata, probe, workflow and local checks. Hosted probe results must guide the correction; the Windows startup criterion is **unfinished**. The [PR](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged, with every unchecked product requirement still required.

## Hosted observation and test-job deadline

For exact head `123947451a46c18dcc94f1d424c9f66dc13f8a7b`, [Windows Deno job 130925135004](https://github.com/link-foundation/meta-sovereign/actions/runs/43139910675/job/130925135004) passes all 4,897 tests with 226 steps and eight ignored cases. Its 10,514-line log records the diagnostic comparison afterward: lines 10494–10495 report identical snapshots of 1,501 files and 18,086,789 bytes. `copyFile` takes summed copy operations of 26,536 ms and 8,298 ms total; buffered copying takes 31,761 ms and 9,468 ms total. Copy operations overlap. The full diagnostic step, including both snapshots and cleanup, lasts about 32 seconds. These observations give no reason to replace the production copy strategy with buffering.

The job starts at 02:17:42 UTC, tests finish at 02:27:06, and diagnostic cleanup ends at 02:27:42. GitHub's preserved check annotation explicitly says: “The job has exceeded the maximum execution time of 10m0s.” The completed experiment therefore leaves the required runtime test path; its reusable bounded script and observations remain available. The unchanged ten-minute deadline and every runtime/OS target stay in place. A focused workflow contract fails against the actual parent and passes afterward, and workflow policy still passes. The [follow-up evidence](data/ci-copy-deadline.tar.gz) includes that regression, full hosted job log, metadata, annotation and source snapshots. This removes observed diagnostic overhead; the next exact-head Windows run must verify the job completes. It does not establish a correction for any future startup failure or complete the remaining issue requirements.
