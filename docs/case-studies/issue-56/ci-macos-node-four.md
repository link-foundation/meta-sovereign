# Four macOS Node partitions within the existing deadline

[Checks run 43689540252](https://github.com/link-foundation/meta-sovereign/actions/runs/43689540252)
for `4dca94624c65cb4dd624654baa96cf233483fffe` cancelled macOS Node shard 1/3,
job `132737990810`. GitHub's annotation explicitly reports the ten-minute job
deadline. The complete 3362-line job log records setup from 07:40:13 UTC, checkout
at line 38 (07:42:15), dependencies at line 465 (07:44:40), and tests at line 478
(07:45:22). At lines 3333–3341, all 2025 tests pass, one native Deno probe is
intentionally skipped, and the suite duration is 286822 ms. The cancellation
immediately follows at line 3342 (07:50:09). No test assertion failed. Setup and
the complete third of the suite exhausted the job budget together.

The existing macOS Node native partitions now use four runners. Windows Node
keeps three; all nine runtime/OS targets, complete source discovery, per-test
limits, concurrency two, mandatory aggregate gating and the ten-minute job
deadline remain unchanged. The contract fails against the previous three-shard
configuration and passes after this change. Its six-file isolated native probe
checks every fixture runs exactly once and a failure still fails its shard.
The focused CI contracts pass 23 Node tests with one explicit Deno-only skip.
No full source suite or platform matrix is run locally.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-node-shards.test.js js/tests/ci-deno-shards.test.js js/tests/ci-contracts.test.js
```

The [archive](data/ci-macos-node-four.tar.gz) and
[manifest](data/ci-macos-node-four.tar.sha256.json) retain the original workflow,
cancelled job, explicit deadline annotation, exact-head workflow metadata,
failing-before contract and focused checks. Recollect with
[collect-ci-macos-node-four.py](../../../experiments/issue-56/collect-ci-macos-node-four.py).
The separate [Ubuntu Deno correction](ci-ubuntu-deno-shards.md) addresses the
other cancellation on the same commit. Every product criterion still needs its
own acceptance evidence and new exact-head hosted checks.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged while the original incomplete requirements are implemented.
