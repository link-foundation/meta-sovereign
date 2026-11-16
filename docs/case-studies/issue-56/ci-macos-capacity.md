# Hosted macOS runner allocation

The remaining failure on published `cb95c654` in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) occurred
before test execution. Main run
[43894465845](https://github.com/link-foundation/meta-sovereign/actions/runs/43894465845)
failed its aggregate gate after macOS Deno partition 2/3 was abandoned.
Every other test, all eight browser shards and native helper jobs passed;
desktop, Pages, security and link workflows passed on the same SHA.

## Root cause and retained evidence

First-attempt job `133397296977` waited from 15:20:55 to 16:02:25 UTC on
2026-11-16. Its job response has an empty runner name and no steps. Its check
annotations explicitly report that no hosted runner acquired the job after
multiple attempts and that macOS ARM capacity is constrained. This is an
allocation refusal, not a Deno test failure. The aggregate log lines 321–325
report `test.result: abandoned`; lines 370–373 retain the failed aggregate gate.

An isolated retry kept the identical source SHA and all previous positive jobs.
Job `133425740540` waited from 16:04:28 to 16:19:28 UTC, then failed allocation
with the same annotations, empty runner name and zero steps. The run's second
attempt also fails the aggregate gate. A job that never started has no test log;
the first job-log request's explicit 404 is retained instead of manufacturing one.

## Correction and verification

Only macOS Deno partition 2/3 now selects `macos-26-intel`, the separate native
Intel pool already used successfully by the macOS Node partitions. Deno
partitions 1/3 and 3/3 retain macOS ARM, as do Bun and the ARM desktop build.
All nine runtime/OS combinations, every test partition, native Deno discovery,
ten-minute job deadline and strict aggregate failure gate remain present.

The existing `ci-deno-shards.test.js` structural check fails on the parent
selection and passes after the correction. It verifies all three partitions
on all three operating systems, the retained ARM selections, the single Intel
override, unchanged test command, no ignored tests and failure propagation.
Only that focused Node check ran locally; native runtime suites remain hosted.
The next published revision still needs all five workflow receipts. This
correction alone accepts no issue criterion and does not make the PR ready.

The [verified archive](data/ci-macos-capacity.tar.gz) and its
[SHA-256 manifest](data/ci-macos-capacity.tar.sha256.json) retain both exact-head
job/annotation responses, both aggregate logs, the complete run metadata,
actual parent workflow, corrected workflow, focused regression and collector.
