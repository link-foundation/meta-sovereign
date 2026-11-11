# Investigate recurring Windows Deno release preparation

[Checks run 43091914519](https://github.com/link-foundation/meta-sovereign/actions/runs/43091914519), created 2026-11-11 at 19:57:05 UTC for `b73f3433`, fails Windows Deno job `130772387445`. The preserved job log has 10,300 lines. Lines 7427–7450 show initial host readiness failing after 10,081 ms, with a missing named pipe. The retained phase trace records CLI command loading at 2,062 ms and immutable release readiness another 6,467 ms later. Of that preparation, copying 1,470 files takes about 5,502 ms; source hashing and copied-content verification each take about 450 ms. The later tamper fixture copies the same source faster, but that does not explain or resolve the initial failure. Final lines 10216–10247 report 4,804 passed, one failed and seven ignored.

The next Windows Deno run executes a finite comparison **after** the real tests, including after a failure, so the probe cannot warm or replace their startup path. It prepares two private snapshots of the actual package: the production `copyFile` method and bounded buffered read/write. Both use the production four-operation limit, complete digest verification and cleanup. Each probe admits at most 4,096 files and 128 MiB; individual buffers are at most 8 MiB. Content and build identities must match. No production copy strategy or deadline changes yet.

Run the reusable probe with:

```sh
deno run --allow-all --no-lock --v8-flags=--max-old-space-size=384 experiments/issue-56/release-copy-strategies.mjs
```

One Linux Node check completes both snapshots with identical digests and 1,470 files / 17,550,144 bytes per method. Copy operations take a summed 2,494 ms with `copyFile` and 3,167 ms with buffering; total stage times are 4,079 and 3,389 ms respectively. Those sums overlap and the second snapshot has warmer source reads. Both methods also include an instrumentation-only source `stat`. These are diagnostic observations, not a Windows result or proof of a faster production strategy. Workflow policy and the focused CI contracts remain required checks.

The [evidence archive](data/ci-release-copy-methods.tar.gz) retains the raw Windows failure, exact SHA metadata, probe, workflow and local checks. Hosted probe results must guide the correction; the Windows startup criterion is **unfinished**. The [PR](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged, with every unchecked product requirement still required.
