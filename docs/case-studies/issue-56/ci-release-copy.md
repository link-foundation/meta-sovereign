# Reduce measured immutable-release preparation work

Issue [56](https://github.com/link-foundation/meta-sovereign/issues/56), [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57). This follows the [startup investigation](ci-rolling-startup.md); it does not establish that every hosted startup failure is resolved.

## Hosted evidence and reproduction

Parent `6dea5f91` Checks run [43040716998](https://github.com/link-foundation/meta-sovereign/actions/runs/43040716998) finishes with failures. Windows Deno job [130595253101](https://github.com/link-foundation/meta-sovereign/actions/runs/43040716998/job/130595253101) reaches immutable release readiness after 6,201 ms without control readiness before the ten-second deadline (full job log 7327–7345, failure 10085–10105). macOS Node shard 2/3 job [130595253486](https://github.com/link-foundation/meta-sovereign/actions/runs/43040716998/job/130595253486) reports a 2,997 ms CLI import and another 4,722 ms to release readiness (1971–1985). Both stop with a missing control socket. Copying dominates the observed preparation phase; neither log establishes the complete remaining worker-start cost.

At implementation parent `4916921f`, run:

```sh
NODE_OPTIONS=--max-old-space-size=384 MS_LIFECYCLE_DEBUG=1 node experiments/issue-56/release-copy-profile.mjs
python3 -B experiments/issue-56/release-copy-before.py
```

The finite probe stages one actual package into a temporary directory, records filesystem operation counts/durations and removes it afterward. It never starts a browser or touches a running application. For 1,455 files the parent issues 1,456 `mkdir` calls for 34 distinct destinations: 954 ms in directory calls, 1,263 ms in sequential copies and 3,646 ms total preparation. These are one local observation, not a benchmark or hosted timing prediction. Two actual-parent regression assertions fail; source-edit rejection still passes.

## Correction

Create each explicit destination directory once. Copy in batches of at most four filesystem operations; this avoids unbounded pressure and additional compiler/build work. Await every issued operation in a batch even if one fails, then propagate the original failure and remove the unfinished directory. No later batch starts after failure.

The complete source digest, copied-content digest, manifest, immutable rename, existing-release verification and dependency resolution remain in the path. A copy failure publishes no release. An edit while copying refuses preparation, and a later clean retry succeeds. The readiness, request, subprocess and job deadlines remain unchanged.

The corrected actual-package probe records 34 directory calls, 14 ms in directory work and 1,794 ms total preparation. File copies still cover all 1,455 files. Summed copy-operation durations overlap because concurrency is bounded at four. Timing differences can include filesystem/cache variation; operation counts provide deterministic evidence of the removed redundant work.

## Verification

- Six focused Node and six Deno tests pass: three bounded package-copy cases and three existing startup-readiness cases. The copy cases verify finite concurrency, complete content/existing-release reuse, drain-before-cleanup after failure, and source-change rejection with a fresh retry.
- One actual CLI startup, repeated serve, prepared UI upgrade, public listener and control-refusal scenario passes. Initial readiness is 6,818 ms with the existing ten-second budget; the whole scenario takes 14,144 ms.
- The existing actual-package tamper regression verifies that changed immutable worker code and mismatched entries still refuse.
- Scoped formatting, strict lint, secret scanning and the unchanged duplication gate are checked before committing.

```sh
node --test --test-concurrency=1 --test-timeout=10000 js/tests/rolling-release-copy.test.js js/tests/rolling-cli-readiness.test.js
deno test --allow-all --no-check js/tests/rolling-release-copy.test.js js/tests/rolling-cli-readiness.test.js
node experiments/issue-56/rolling-startup-profile.mjs
node --test --test-concurrency=1 --test-timeout=20000 --test-name-pattern='prepared release snapshots' js/tests/rolling-cli.test.js
```

Sources, actual-parent release code, complete failing Windows/macOS job logs, bounded probe outputs and test logs are retained in [the evidence archive](data/ci-release-copy.tar.gz) with a checksummed manifest.

## Remaining work

Require exact new-head hosted results before concluding that Windows Deno/macOS Node startup now meets the fixed budget. If startup still fails, preserve the phase traces and investigate the worker/control path rather than raising deadlines. WebKit's closed Questions disclosure, the earlier Lino-sync navigation error, repeated Ubuntu dependency DNS failures and every unchecked issue-wide criterion remain unfinished. PR 57 stays draft and unmerged.
