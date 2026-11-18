# Windows/Deno pending-import measurements

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The Windows/Deno startup delay remains unexplained. This diagnostic extension
retains the complete failing and subsequent passing job logs, adds bounded
resource observations during application imports, and changes no deadline or
acceptance criterion. The issue inventory remains **88 verified / 30 unfinished**.

## Observed failure and later success

Checks run `44390156114` was created at `2026-11-18T20:21:25Z` for
`aa095a981ff47e0c2e099f0fd4cc6b34290da10d`. Its Windows/Deno shard 2 job
`135108320789` fails two rolling CLI tests. Full log lines 17403–17443 retain both
`CLI host did not start` stacks and Windows named-pipe `ENOENT` causes.

Lines 15159–15191 show the first failure's last captured progress. Immutable
release staging finishes after 2,302 ms; the worker reports `init_started` and
`import_started` after 1,244 ms. No `import_finished` is captured before the
10,261 ms readiness refusal. The second test does not print its child's pending
phase, so its stack alone does not establish the same import state. Both tests
drain their owned child before removing the fixture.

The following Checks run `44392503456`, created at `2026-11-18T20:34:45Z` for
`f34c800a53b6a2c7337677dc81c477642f88bfa7`, passes all three Windows/Deno shards.
Its shard 2 job `135121992166` retains initial readiness at **5,750 ms**. Full log
lines 15162–15205 show release staging at 2,750 ms, worker import start at 939 ms
and completion at 2,241 ms, and successful default-file replacement. Those
published changes concern synthetic verification-code serialization; they do
not correct the rolling startup path. The successful run therefore does not
establish a cause or correction for the preceding delay.

The finite parse-only import graph contains 976 relative JavaScript modules and
4,982,951 source bytes at the published source. It also records bare imports,
without executing or traversing them. That size is context, not evidence that a
particular module, filesystem operation or compiler caused the Windows delay.
No unused route or background service is removed to improve this measurement.

## Added observation

`MS_LIFECYCLE_DEBUG=1` now observes the same accepted application import before
the normal application resource observer starts. It records a baseline, at most
thirty one-second resource samples, and a final sample when an import settles
before that limit. The final sample also covers a load during which no interval
callback could run. The observer stops on success, synchronous failure and
asynchronous rejection; its timer cannot keep the worker alive.

The host's opt-in trace accepts only fixed import-resource events and finite,
nonnegative CPU percentage, resident bytes and scheduler-lag values. It does not
copy arbitrary worker diagnostic text into these progress lines. CPU counters
cover the process rather than identifying an individual dependency. Timer
delivery and the final sample help characterize a later delay; neither alone
identifies its cause. Ordinary imports allocate no extra observer or timer.

The existing ten-second readiness budget, worker RPC budget, request budgets,
complete release verification, runtime partitions and CI failure gates remain
unchanged. EOF and broken-output cleanup still own accepted initialization
until the module and its resources drain.

## Focused verification

```sh
python3 -B experiments/issue-56/worker-import-resources-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/worker-import-resources.test.js js/tests/worker-client.test.js js/tests/worker-loading.test.js js/tests/worker-input-close.test.js js/tests/resource-diagnostics.test.js
node --max-old-space-size=384 experiments/issue-56/rolling-startup-profile.mjs --deno
node --max-old-space-size=384 experiments/issue-56/worker-import-graph.mjs
```

Two exact published-parent observability regressions fail while their default-off
control passes: the real gated child emits no pending-import resource baseline,
and its host omits the three allowed resource progress frames. All fourteen
selected Node checks pass after the change, with one Deno-only skip. They cover
the finite sampling cap without sleeping or stress, default silence, result and
error preservation, final measurement without interval delivery, numeric-only
host output and actual EOF/broken-pipe drainage. One isolated real Deno
start/reuse/upgrade scenario verifies the production observation path. Full
runtime, browser and packaging matrices remain hosted.

That isolated Linux/Deno scenario reaches initial readiness at 5,668 ms. The
worker starts its import at 1,320 ms and finishes at 2,578 ms; its final sample
reports 101.9% process CPU, 234,172,416 resident bytes and 263 ms scheduler lag.
No periodic sample runs during that import, so the final measurement supplies
information the interval alone would miss. These Linux measurements do not
explain the earlier Windows failure.

The [evidence archive](data/ci-import-resources.tar.gz) and its
[hash manifest](data/ci-import-resources.tar.sha256.json) preserve exact source,
both complete Windows job logs, run/job identities, finite parent/current checks
and local timing limits. Hosted verification of this diagnostic source remains
required. No Windows performance fix or inventory acceptance is claimed.
