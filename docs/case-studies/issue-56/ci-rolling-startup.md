# Investigate the missing rolling-host control socket

Current-parent `fb6fc9d2` macOS Node shard 2/3 [job 130512842724](https://github.com/link-foundation/meta-sovereign/actions/runs/43017302517/job/130512842724) fails initial CLI readiness. Its complete log is preserved in the [Questions CI evidence](ci-question-groups.md): lines 1995–2008 contain the immediate failure and partial release timings; lines 2863–2878 retain the final `CLI host did not start` error and `ENOENT` control-socket cause. The last observed release phase is `hashed after 809 ms`; the subsequent snapshot, worker and control phases were not reached before the fixture stopped the child. The earlier Windows Bun `HOST_TIMEOUT` case is a different observed failure, documented in [readiness investigation](ci-question-watch-readiness.md).

One bounded Linux production CLI startup/repeated-serve/upgrade probe passes before additional tracing (15.5 seconds total). The instrumented probe also passes (17.1 seconds total). Its initial readiness is 6,981 ms: CLI imports take 1,263 ms; release staging takes 3,989 ms, including copying until 3,323 ms and verification until 3,983 ms; the rolling worker is ready at 5,619 ms after staging began and control metadata at 5,640 ms. These observations identify the local costs but do not prove why the macOS run exceeded ten seconds. They also do not establish a performance regression from tracing: the two single observations are not a benchmark.

`MS_LIFECYCLE_DEBUG=1` now records CLI module import time, initial staging/worker/control boundaries and the snapshot-copy boundary. The existing fixture records elapsed readiness time on success or failure. All new production diagnostics are off by default and contain phase names/counts/timings, with no source text, credentials or store paths. Readiness still requires the actual worker and durable metadata. Its existing ten-second budget and thirty-second test deadline are unchanged; no operation is retried beyond the existing read-only status loop.

Reproduce without a source build, live provider or running user server:

```sh
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/rolling-startup-profile.mjs
```

The probe runs one existing production CLI case with its own temporary store, ephemeral port and cleanup. Five focused Node and five Deno checks cover delayed output/exit status and the bounded readiness loop. Scoped lint, formatting, secret scanning and the duplication gate pass. The [archive](data/ci-rolling-startup.tar.gz) and [manifest](data/ci-rolling-startup.tar.sha256.json) retain source, complete hosted failure, exact-head metadata and both local observations; recollect with [collect-rolling-startup.py](../../../experiments/issue-56/collect-rolling-startup.py).

The hosted startup failure remains unresolved pending its actual phase trace. This is an investigation step, not a claimed correction. Current-head CI, the independent WebKit hidden-preview failure and every unchecked issue requirement remain required. [PR57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged.
