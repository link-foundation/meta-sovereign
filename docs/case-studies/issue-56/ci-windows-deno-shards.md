# Keep Windows Deno checks within their existing deadline

[Checks run 43193074875](https://github.com/link-foundation/meta-sovereign/actions/runs/43193074875), created at 2026-11-12 09:37:20 UTC for `9d805e4fdb1fded3d408eb97fbe4db4da32d5c87`, cancelled its Windows Deno job `131100508779`. Every other runtime target and all eight browser shards passed. The aggregate gate correctly failed because `test: cancelled`. GitHub's check annotation explicitly reports `The job has exceeded the maximum execution time of 10m0s`.

The raw Windows log starts at 09:44:41. Setup includes checkout, merge simulation, Node/npm/Deno installation and reviewed native dependency scripts. The test step starts at 09:46:56 (line 2064); the first actual suite module starts at 09:47:00 (line 2147). At 09:54:47, line 10364 reports `The operation was canceled.` The preceding vacancy-reader assertions passed. The suite had not reached its final summary. Its 621 observed modules occupied about 467 seconds after setup; the largest observed module interval was 17.5 seconds for `rolling-cli.test.js`. Intervals include startup of the next module. These observations establish insufficient time for the complete serial suite on this runner, without evidence that an individual test hung. They do not predict a complete-suite duration or exclude future independent failures.

The workflow now gives Windows Deno three native `--shard` partitions. Deno sorts discovered test files and distributes consecutive groups; every partition retains the original `js/tests` discovery and `--allow-all` required by Windows named pipes. Other Deno targets use `1/1`. All nine runtime/OS combinations, the existing macOS Node partitions, native dependency installation, crypto diagnostics, aggregate failure propagation and the ten-minute job limit remain mandatory. No retry, test filter, exclusion, extra local concurrency or extended deadline was added.

The new workflow contract fails against the unchanged parent configuration, which has no Windows Deno partitions. After the change, Node passes that contract and the existing macOS Node partition check (two passes; the Deno-native probe is explicitly skipped outside Deno). Deno passes both new checks. Its native probe executes six tiny isolated test files across all three partitions, proves each executes exactly once, injects a failing case and verifies a nonzero result, then verifies an invalid partition refuses before execution. Subprocesses run sequentially with a 128 MiB JavaScript heap. Local Deno is 2.9.7; hosted CI installs the pinned 2.9.8. The full source suite and Windows execution remain hosted checks.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-deno-shards.test.js js/tests/ci-node-shards.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all js/tests/ci-deno-shards.test.js
python3 -B experiments/issue-56/analyze-windows-deno.py ci-logs/cv-prepare-parent-windows-deno.log
```

The [evidence archive](data/ci-windows-deno-shards.tar.gz) and [manifest](data/ci-windows-deno-shards.tar.sha256.json) retain the cancelled job, failed aggregate log, exact-head metadata and deadline annotation, timing report, parent workflow, focused tests and scoped gates. Recollect with [collect-ci-windows-deno.py](../../../experiments/issue-56/collect-ci-windows-deno.py). The full workflow log is separately preserved locally as `ci-logs/resume-published-checks.log`.

Require completed hosted checks for the new commit before claiming this failure resolved. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged while every unchecked product and delivery criterion is implemented and verified.
