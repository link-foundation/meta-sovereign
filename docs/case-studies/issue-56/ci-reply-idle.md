# Wait for the reply fixture's actual idle registration

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains
draft and unfinished. Published `64a9b6e2` has six failing runtime jobs in
[run 43513510889](https://github.com/link-foundation/meta-sovereign/actions/runs/43513510889).
All six fail the same new fixture, `close waits for a held save and cancels
queued idle work`, at `reply-cache-ownership.test.js:426`. Its `tick` helper
throws `the finite cache operation did not finish` after 100 immediate turns.

The archive preserves each complete job log. Error lines are 8394 in
`head64-deno-linux.log`, 10888 in `head64-deno-macos.log`, 5155 in
`head64-deno-windows2.log`, 1548 in `head64-bun-linux.log`, 7242 in
`head64-bun-macos.log` and 6829 in `head64-bun-windows.log`. The matching
job IDs and conclusions are retained in `reply-idle-parent-jobs.json`.

The cache intentionally schedules whole-model persistence with a zero-delay
timer before requesting idle work. A finite number of immediate turns does
not guarantee that this timer has fired. Bun's hosted fixture fails after
roughly one millisecond. An unchanged local full-file Bun invocation also
reproduces the exact assertion (12 passes, one failure). Isolating the case
passes under both Bun and Deno, so an isolated pass is insufficient evidence
that the original polling is correct.

The fixture now resolves an explicit promise when its mocked idle callback
is registered. A referenced three-second timer keeps the process alive while
production deliberately unrefs its timer, and rejects if registration never
arrives. It is always cleared after the wait. The existing three-second test
deadline, held-save assertions, cancellation count and prohibition on a late
second save remain unchanged. Production scheduling and all CI deadlines are
unchanged.

Reproduce with `bun test js/tests/reply-cache-ownership.test.js` on parent
`bf633bb2`; the recorded unmodified failure is in
`ci-reply-idle-bun-file-before.log`. The same 13-case command passes after the
correction, as does the selected Node case. Strict scoped lint, formatting
and diff checks pass. Full runtime verification remains on hosted CI.

The [checksummed archive](data/ci-reply-idle.tar.gz) and
[manifest](data/ci-reply-idle.tar.sha256.json) retain before/after sources,
local failure/success and all six complete hosted failure logs.

Separate preceding corrections have hosted confirmation on `64a9b6e2`:
Windows Node job `132192354543` passes its actual minimal IndexedDB shim
(log line 1195); WebKit shard 4 job `132192355053` passes all six résumé
scenarios (lines 974–990). Windows Deno shard 3 job `132192354754` reports
initial host readiness at 4975 ms, with all eight copy checkpoints and
snapshot completion (lines 2212–2242). The earlier cold-copy slowdown's
cause remains unproven; this successful observation does not establish a
performance correction. Full failed and successful logs are retained.

Every unchecked original acceptance criterion remains required. Private
vacancy choices are a verified foundation; automatic application execution,
questionnaire policies and complete provider/platform parity remain unfinished.
