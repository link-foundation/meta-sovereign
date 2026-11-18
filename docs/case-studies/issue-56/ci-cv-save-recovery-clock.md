# CV Save recovery fixture clock

Checks run [43611833853](https://github.com/link-foundation/meta-sovereign/actions/runs/43611833853)
started at 2026-11-14 15:44:58 UTC for `ec835b0b109846abcd2f615ba8507d0d79f6a69d`.
macOS Node shard 3, job `132499772549`, fails the simulated navigation recovery
case. Its complete retained log has 3,373 lines. Lines 3343–3358 identify
`cv-save-watch-recovery.test.js`, `jobs-cv-readback` and a 109.217484 ms duration.
The fixture gives both probes a 100 ms wall-clock verification budget. The first
probe intentionally throws an execution-context-destroyed error; a late first
poll can therefore consume the budget before the required second probe.
The hosted scheduler delay itself was not measured separately.

A finite experiment delays that first synthetic probe by 120 ms. The exact
published production parent fails with the same `jobs-cv-readback` error. The
corrected fixture uses a logical clock and poll function, advancing one
millisecond per poll. The production defaults remain the existing timers/promises
wait, system time, 30-second verification deadline and five-read bound. No native
Save, navigation or retry behavior changes. The original two probes, one saved
export and final owner-revision assertions remain; extra assertions cover the
100 ms deadline and five unsuccessful read attempts.

```sh
PYTHONDONTWRITEBYTECODE=1 python experiments/issue-56/cv-save-recovery-clock-before.py
CV_WATCH_FIXTURE_DESCHEDULE_MS=120 node --max-old-space-size=384 --test --test-concurrency=1 js/tests/cv-save-watch-recovery.test.js js/tests/cv-save-watch.test.js
CV_WATCH_FIXTURE_DESCHEDULE_MS=120 DENO_JOBS=1 deno test --cached-only --allow-all --no-check js/tests/cv-save-watch-recovery.test.js
```

The delayed corrected fixture and compatibility checks pass: Node 17, Deno 6.
Scoped formatting, strict lint, secrets and unchanged 6.5% duplication gates pass.
The first strict-lint attempt identified one missing brace and the added default
parameters exceeding the existing complexity budget; the final shared clock
argument resolves both without relaxing a rule. Evidence retains the final checks.
`data/ci-cv-save-recovery-clock.tar.gz` and its SHA-256 manifest retain source,
parent source, logs and CI metadata. All five workflows pass on corrected head `0aa608516804400f38c215f12f626f92e8f63f3e`,
created 2026-11-14 16:08:09 UTC. [Checks 43613931687](https://github.com/link-foundation/meta-sovereign/actions/runs/43613931687)
passes every runtime lane and all eight browser lanes, including macOS Node shard 3.
Pages, Security, Broken Links and Desktop also pass. Complete passing logs and
metadata are retained in `data/hosted-0aa60851.tar.gz` with a SHA-256 manifest. All 81 original incomplete inventory rows remain required; PR57 stays
draft and unmerged.
