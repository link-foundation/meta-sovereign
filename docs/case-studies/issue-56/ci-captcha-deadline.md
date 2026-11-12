# CAPTCHA deadline fixture on macOS

Published commit `727b3f6b30337d0f6de3041c7ab31d7b2b744cbf` has Checks run
[43150797918](https://github.com/link-foundation/meta-sovereign/actions/runs/43150797918),
created 2026-11-12 03:50:01 UTC. Its only failed test job is macOS Node shard
3/3, job `130961294453`. Every hosted browser shard and the other runtime jobs
pass. Full raw log lines 121499–121509 show the CAPTCHA pause/resume test failing
with `form-session-missing` while `completed()` polls `prefillStatus()`.

The test configures a 100 ms ordinary operation deadline, waits 120 ms during
manual verification, then expects guarded replanning and two writes to finish.
The pause suspends only the ordinary budget; it does not reset time already
spent. After verification clears, the remaining ordinary deadline legitimately
expires if asynchronous guard/planning work or host scheduling exceeds that
budget. Cleanup then makes status report either `form-timeout` while draining or
`form-session-missing` after removal. The hosted log identifies the latter state;
it does not identify the exact slow phase on that runner.

`captcha-deadline-probe.mjs` reproduces this path without stressing the host: one
finite 120 ms guard delay after verification, the original 100 ms budget and
zero writes. The preserved probe records 94 ms remaining, a guard starting at
210 ms and ordinary expiry at 259 ms, followed by `form-session-missing`.
`captcha-deadline-before.py` applies the same bounded delayed guard to the actual
`868b1f65` parent test and the corrected test. The parent fails with
`form-timeout`; the corrected test passes with the same 100 ms ordinary budget,
2,000 ms manual ceiling and 5,000 ms test deadline. Both working files are
restored in `finally`.

The corrected fixture controls deadline time independently of physical test
scheduling. It advances 120 ms during the manual pause, then resumes the same
guarded operation, including a deliberate physical guard delay. Separate small
tests assert the exact unspent budget (30 ms used, 70 ms remaining), idempotent
resume, ordinary expiry, manual-ceiling expiry and Stop clearing both timers.
No production budget or CI deadline increases. Optional content-free deadline
phase/count/time events use the existing browser trace hook, remain silent by
default and cannot interrupt cleanup if a diagnostic callback throws.

Twenty-seven focused checks in each of Node and Deno include the existing
review-session lifetime checks. Scoped lint,
formatting, secrets and the unchanged duplication gate supply local validation.
Raw parent job/full-run logs, before/after replay and current sources are
preserved in [the evidence archive](data/ci-captcha-deadline.tar.gz).
Exact new-head hosted validation and every unchecked issue criterion remain
required; [PR57](https://github.com/link-foundation/meta-sovereign/pull/57) stays
draft and unmerged.
