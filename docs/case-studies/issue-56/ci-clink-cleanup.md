# Preserve clink failures without hanging the runtime shard

The UI-head [Checks run 43083805944](https://github.com/link-foundation/meta-sovereign/actions/runs/43083805944), created 2026-11-11 at 19:04:51 UTC for `41fd7342`, has a concrete failure before its macOS Node shard cancellation. Job `130752686210` reports `startClinkServer serialises queries and reconnects after a hang-up` failing at 19:27:31 UTC (preserved raw log line 1989). Line 1992 reports cancellation at 19:33:07 after the existing ten-minute job deadline. The intervening file never completes, so the ordered reporter cannot print the original assertion stack.

The real test only closed its loopback server after every assertion passed. One deliberately dropped query reproduces an assertion failure after roughly 300 ms while the server keeps the child alive. A finite two-second observation then interrupts the actual parent test. A separate regression also proves that failed production startup leaves its owned child running. These experiments establish cleanup defects; they do not establish which assertion originally failed on macOS.

Cleanup now registers before client startup and awaits the fixture server's close acknowledgement after either success or failure. Failed production startup disposes its owned child. Closing a client rejects and drains current and queued queries, rejects later admission and never opens another socket. A deterministic mocked regression also fails against the parent because queued queries previously reopened connections after close.

Opt-in `MS_CLINK_DEBUG=1` logs startup, query and close phases, elapsed times, query sequence numbers and bounded failure categories. It logs no query text, database paths, response contents or addresses. Ordinary execution stays silent. Non-Linux Node CI enables these phases; job and query deadlines stay unchanged. Future intermittent failures must retain their original error and fail the shard promptly.

Focused verification passes twelve Node checks, including the existing shard contract, and eleven Deno checks. Each runtime also reports the existing live clink integration as skipped because no compatible binary is installed. The injected failure still exits nonzero, prints its full timeout stack and exits within the observation budget. Normal serialisation, syntax-error reconnect and query-timeout reconnect retain their original checks and 300 ms fixture query deadline. Strict changed-code lint and workflow policy pass.

```sh
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/clink-failure-cleanup.mjs
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/clink-cleanup.test.js js/tests/reply-store-clink.test.js js/tests/ci-node-shards.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check js/tests/clink-cleanup.test.js js/tests/reply-store-clink.test.js
```

The [evidence archive](data/ci-clink-cleanup.tar.gz) retains actual parent sources, three failing-before results, passing focused results and the hosted failure log. Recollect with [collect-ci-clink-cleanup.py](../../../experiments/issue-56/collect-ci-clink-cleanup.py). The original intermittent macOS assertion, exact-head hosted validation and all unchecked product requirements remain open in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
