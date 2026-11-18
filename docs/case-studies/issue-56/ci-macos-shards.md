# Keep macOS Node validation within its existing deadline

[Checks run 42964992347](https://github.com/link-foundation/meta-sovereign/actions/runs/42964992347), created 2026-11-11 at 05:19:20 UTC for `5518950583567ffa083ccb352793b90690a26969`, finished cancelled. Both browser engines and every other runtime/OS target passed. The only cancelled runtime job was macOS Node shard 1/2 (`130341086349`); the dependent pipeline gate correctly failed (`130349340570`, log lines 282–283: `test: cancelled`).

The cancelled job began at 05:24:39 UTC. Tests started at 05:27:59 after action setup, checkout and dependency installation. At 05:34:51 its raw log line 3544 reports `The operation was canceled.` GitHub's annotation explicitly identifies `The job has exceeded the maximum execution time of 10m0s`. The preceding cases passed, with no assertion failure. Its companion shard 2/2 (`130341086233`) passed 2,370 tests in 203,327 milliseconds (log lines 3864–3871), while shard 1/2 was still running after almost seven minutes. These measurements show cold setup and uneven observed shard durations; they do not establish that any one test is hanging.

The workflow now distributes the same macOS Node target across three native Intel runners. The existing ten-minute job deadline, two test processes per runner and 30-second test deadline remain in force. Every existing test stays selected. All nine runtime/OS combinations and both browser lanes remain mandatory; the pipeline gate still fails if a shard fails or is cancelled.

Eighteen focused Node checks and the same eighteen Deno checks pass. The existing shard contract launches tiny real Node test fixtures, proves that all configured shards collectively execute each fixture exactly once, then injects a failure and checks its nonzero result. Other focused contracts verify mandatory browser coverage and failure propagation. No full runtime suite was run locally.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/ci-node-shards.test.js js/tests/ci-contracts.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check js/tests/ci-node-shards.test.js js/tests/ci-contracts.test.js
```

The [archive](data/ci-macos-shards.tar.gz) and [manifest](data/ci-macos-shards.tar.sha256.json) retain both shard logs, the failed pipeline log, exact-head metadata/annotation, source before and after correction and focused results. The full workflow log is also preserved locally in `ci-logs/checks-42964992347-full.log`. Recollect with [collect-ci-macos-shards.py](../../../experiments/issue-56/collect-ci-macos-shards.py). Hosted validation of the new head is still required.

GitHub returns HTTP 406 for `gh pr diff 57` because this PR exceeds its 300-file diff limit. Review uses the complete paginated PR-files endpoint and local commit/base diffs. [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft and unmerged while all unchecked issue requirements are completed.
