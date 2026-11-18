# Drain a worker after losing its host channels

PR: https://github.com/link-foundation/meta-sovereign/pull/57

Main run [43572547657](https://github.com/link-foundation/meta-sovereign/actions/runs/43572547657)
for `1e6582c3` fails only macOS Node shard 2/3, job `132380690633`. Its complete
3,138-line log records initial host readiness expiring after 10,034 ms at lines
2239–2272. Release staging is ready at 3,977 ms, but no worker-ready phase appears.
Final lines 3115–3117 report `ENOTEMPTY` while removing the temporary store.
The complete workflow log is retained in the preceding
[application résumé evidence](application-resume.md).

The cleanup investigation exposed a reproducible worker ownership bug. The input
close handler reads `worker` while asynchronous initialization still has it set to
null. Initialization then opens the store and listener after that sole close
event. A broken output pipe also raises an unhandled `EPIPE` instead of draining
accepted operations. The worker can outlive its host or exit without its normal
store close. This can explain concurrent cleanup writes, but the original hosted
timing and its startup delay have not been proven by the local reproduction.

The worker now stops accepting messages after either channel loss, waits for its
already accepted operation chain, stops diagnostics and closes the actual worker
resources. Drain is idempotent. It emits no responses to a lost host. Normal IPC
close acknowledgements and the supervisor's process/stdio ownership remain intact.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/worker-eof-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/worker-input-close.test.js js/tests/worker-client.test.js js/tests/rolling-cli-readiness.test.js
deno test --allow-all --no-check --v8-flags=--max-old-space-size=384 js/tests/worker-input-close.test.js js/tests/worker-client.test.js js/tests/rolling-cli-readiness.test.js
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/rolling-startup-profile.mjs
```

The two finite real-process regressions fail on published parent `02303fc7`:
EOF leaves its initialized listener alive, and a broken output pipe exits with
code one. Cleanup terminates and drains both children. After the fix, both close
normally, including under Deno. Each child uses a temporary store and an ephemeral
listener; the tests have a fifteen-second channel-drain bound and a twenty-second
test deadline. They do not touch a running user application or live provider.
Seven focused Node checks pass with one runtime-specific skip; all eight Deno
checks pass.

The single existing production CLI startup/repeated-serve/upgrade check passes.
Its initial readiness is 5,155 ms: the worker starts initialization 2,577 ms after
spawn, finishes it at 2,818 ms and makes control metadata ready 4,704 ms after
release staging begins. This Linux observation is not a macOS timing diagnosis
or a performance benchmark.

`MS_LIFECYCLE_DEBUG=1` adds constant-cost worker spawn and initialization boundary
timings to the existing opt-in lifecycle diagnostics. Only fixed phase names and
elapsed milliseconds are emitted. This separates pre-initialization module loading
from actual worker initialization on a future hosted failure. Production tracing
is off by default. Existing readiness, group and CI deadlines are unchanged.

Sources, parent reproduction, complete failed job log, runtime results and scoped
gates are preserved in `data/ci-worker-input-close.tar.gz` with hashes in
`data/ci-worker-input-close.tar.sha256.json`. Exact-head hosted CI remains required;
the original startup latency and all 81 unchecked original issue requirements
remain unfinished. PR57 remains draft and unmerged.
