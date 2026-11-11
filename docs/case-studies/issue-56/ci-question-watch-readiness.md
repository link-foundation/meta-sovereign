# Windows Bun startup readiness

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Every unchecked acceptance criterion remains required.

The Checks workflow created at 2026-11-11 10:44:16 UTC for exact commit
`2b0f655754a67f0f9a06324adc0a88158cae5093` failed its Windows Bun job
[130475302851](https://github.com/link-foundation/meta-sovereign/actions/runs/43006107625/job/130475302851).
The complete downloaded log has 7,830 lines. Lines 5,168–5,177 report
`rolling-cli` initial readiness failing with `HOST_TIMEOUT` / “server upgrade is
still preparing”; lines 7,806–7,812 retain the only failing test, 4,819 passing
tests and eight skips. The watcher tests passed in this job. Other runtime jobs
passed when last inspected; browser jobs were still running. Those incomplete
jobs are not claimed as passing.

The startup probe retried a missing/refused connection but treated its one-second
status timeout as a terminal error. The server deliberately accepts control
connections before durable initial metadata is saved and withholds readiness
until that save finishes. A controlled blocked-metadata fixture reproduces the
same early exit against the actual parent probe. The hosted log does not prove
why the Windows reply was delayed; it contains no startup phase trace. The fix
handles the observed temporary status failure without guessing that latency's
cause or changing production timeouts.

Read-only startup probes now retry `HOST_TIMEOUT` within a fixed ten-second total
budget, including socket waits. Definite refusals still fail immediately and
budget exhaustion retains the last cause. No upgrade or mutation is retried.
Opt-in `MS_LIFECYCLE_DEBUG=1` control traces retain listening, metadata and request
phase timings without paths or request contents. Windows/macOS Bun CI now enables
the existing diagnostics, as Node and Deno already do. Production tracing remains
off by default.

Run `python3 experiments/issue-56/rolling-readiness-before.py` to extract the
unchanged parent probe into the test helper temporarily and reproduce the
one-second failure. Restoration is guaranteed by `finally`. Seven focused Node
checks pass, including the actual CLI's initial start, repeated serve and prepared
upgrade. The final three probe regressions and five corresponding Deno checks
pass: delayed metadata recovers, repeated timeouts exhaust the finite budget,
and a definite refusal gets one attempt. Full Windows validation remains hosted.

The [checksummed archive](data/ci-question-watch-readiness.tar.sha256.json)
preserves the complete failing CI log, exact-head job metadata, before/after
sources, reproducer and focused validation. Subsequent exact-head CI must pass;
this case does not complete all-unread orchestration or any other open issue work.
