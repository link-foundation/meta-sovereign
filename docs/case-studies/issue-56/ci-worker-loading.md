# Observe cold application-module loading separately from process startup

Published `0e50881450121bedb200a85e0bb7e4fff0eacc9f` fails
[Windows Deno shard 2/3](https://github.com/link-foundation/meta-sovereign/actions/runs/43922788772/job/133498912762).
The preserved 6,008-line job log records initial readiness failure after 10,117 ms
at lines 5678–5701. CLI loading takes 304 ms; release staging takes 6,705 ms,
including copying through 6,494 ms and verification through 6,698 ms. The last
worker checkpoint is `spawning`. Lines 5951–5967 retain `CLI host did not start`
and its `ENOENT` Windows named-pipe cause. The module finishes with 2,243 passed
tests, one failure and two ignored tests (5973). The separate `init_failed` at
5750 belongs to a deliberate failed-recovery case which passes.

The existing first worker checkpoint followed static imports of the complete
application graph. Consequently this log cannot distinguish OS/runtime process
startup from application-module loading. It also does not establish whether
later initialization or control metadata would have completed within the budget.

The worker now establishes its existing IPC reader before dynamically importing
the same application module during the accepted `init` operation. It reports
fixed `import_started` and `import_finished` checkpoints through the existing
`MS_LIFECYCLE_DEBUG=1` opt-in trace. No paths, content or exception text enter
these checkpoints. The initialization remains on the existing serialized chain;
closing input or breaking output still drains accepted initialization and closes
its resources. Import failures follow the existing initialization failure path.

Two new finite checks fail against exact published implementation parent
`484a6b5141e4e58df0ab5070853c47d221c2cb4b`: a real child with a gated application
module emits no progress before that module finishes, and the client omits import
checkpoints. After the change the child reports the pending import, retains it
through EOF, and closes the initialized fixture. The client test verifies default
silence and rejects arbitrary diagnostic content from its fixed trace.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/worker-loading-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/worker-loading.test.js js/tests/worker-input-close.test.js js/tests/worker-client.test.js js/tests/rolling-cli-readiness.test.js
NODE_OPTIONS=--max-old-space-size=384 deno test --allow-all --no-check --no-lock --node-modules-dir=manual js/tests/worker-loading.test.js js/tests/worker-input-close.test.js js/tests/worker-client.test.js js/tests/rolling-cli-readiness.test.js
node --max-old-space-size=384 experiments/issue-56/rolling-startup-profile.mjs
```

Nine selected Node checks pass (one Deno-only skip), and all ten selected Deno
checks pass. Both real EOF/broken-pipe cleanup regressions remain intact. One
isolated production CLI start/reuse/upgrade scenario passes without a source
build: initial readiness takes 4,413 ms. Its worker accepts initialization after
72 ms, reports import start at 74 ms, import completion at 1,743 ms and completed
initialization at 1,928 ms. These Linux observations demonstrate the new phase
distinction; they are not a Windows reproduction or a performance benchmark.

The ten-second readiness budget, request budgets, runtime partitions, complete
release verification, functional assertions and CI failure gate remain unchanged.
Read the next exact-head Windows checkpoints before attributing or claiming a
correction for the hosted delay. This diagnostic change accepts no inventory
criterion; all 60 unchecked requirements remain unfinished and
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.

[Preserved evidence](data/ci-worker-loading.tar.gz) and
[hash manifest](data/ci-worker-loading.tar.sha256.json).

The next exact-head Windows Deno trace passes initial CLI readiness at 6,905 ms
and distinguishes its import phase. Its later failure is a relocated recovery
fixture that missed the new dynamic import, reproduced separately in
[worker fixture imports](ci-worker-fixture-imports.md). The older readiness
refusal's cause remains unproven; this successful observation does not replace
the complete exact-head CI gate.
