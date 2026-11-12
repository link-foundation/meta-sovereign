# Keep Windows Deno validation within its existing deadline

[Checks run 43193074875](https://github.com/link-foundation/meta-sovereign/actions/runs/43193074875), created 2026-11-12 at 09:37:20 UTC, validates exact published head `9d805e4fdb1fded3d408eb97fbe4db4da32d5c87`. All eight browser shards and every other runtime target passed. Windows Deno job `131100508779` was cancelled; the pipeline gate correctly failed because `test: cancelled` (full workflow log lines 130777–130779).

The cancelled job started at 09:44:39 UTC. Setup, checkout, npm bootstrap and reviewed native dependency installation consumed about 137 seconds. Tests ran from 09:46:56 until 09:54:47, when the raw job log reports `The operation was canceled.` GitHub's check annotation explicitly states: “The job has exceeded the maximum execution time of 10m0s.” The preceding cases, including the final vacancy-reader cases, passed. This is evidence of a job budget failure, not proof of a hanging test or an individual assertion failure. The previously removed release-copy experiment is absent from this required path.

The workflow now partitions Windows Deno's test files across three runners with Deno's native `--shard` option. The existing ten-minute job deadline stays in force. Each runner still executes its files sequentially, retains private fixture permissions and runs the Windows crypto diagnostic. All nine runtime/OS combinations remain covered, and macOS Node's existing three shards remain unchanged. No test filter, ignored path, success override or deadline increase is introduced. A failed or cancelled shard still fails the terminal release gate.

The focused regression fails against the actual parent because Windows Deno has no configured shards. Tiny real Deno fixture files prove that the three native shards collectively execute every fixture exactly once, then demonstrate a nonzero result for an injected test failure. Focused Node and Deno checks also retain the macOS shard, browser coverage and workflow failure-propagation contracts. Full suites remain assigned to hosted CI.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/ci-deno-shards.test.js js/tests/ci-node-shards.test.js js/tests/ci-contracts.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check js/tests/ci-deno-shards.test.js js/tests/ci-node-shards.test.js js/tests/ci-contracts.test.js
node js/scripts/check-ci-workflows.mjs
```

The [archive](data/ci-deno-shards.tar.gz) preserves the cancelled raw job log, complete workflow log, exact-head jobs and annotations, failing-before result, focused checks and source snapshots. Current-head hosted completion is still required. The published head's successful Backlinks shard does not prove a root cause for its earlier intermittent disclosure failure. All unchecked product criteria remain required; [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged.
