# Observe acknowledged vacancy discovery progress

Checks run `43716827172`, created at `2026-11-15T13:01:38Z` for published
`aae37f2ddd2ad17e9baaa7a0e315db9722ccdd7e`, failed only WebKit shard 2/4
and its aggregate job. The other four workflows passed. The full failed
shard log, lines 1682–1698, records a 30-second locator deadline awaiting
`data-discovery-phase="completed"` at `e2e-vacancy-discovery.mjs:44`.
The aggregate log, lines 365–367, attributes failure to `e2e-browser`.

The scenario performs four sequential native navigations: two search pages
and two eligible full descriptions. Installed browser-commander 0.34.1
retains three one-second URL stability samples before and after navigation.
Even successful reads therefore consume roughly six seconds each, before
owned browser creation, saved progress polling and host scheduling. The test
gave the complete four-read sequence a single 30-second locator wait.

The unchanged published helper passed an isolated real WebKit run in 38.070
seconds overall. A controlled fixture delay of exactly three seconds before
each of its four native navigations reproduces the original completion-wait
failure. The probe uses the actual `b0d1b6a3` helper and restores it in
`finally`; it neither changes native readiness nor launches a browser matrix.
The delay is validated as an integer from zero to 3000 ms and defaults to
zero. It applies only to this private finite fixture.

The helper now observes each of the three acknowledged vacancy cards using
the existing locator deadline, then requires terminal completion. The same
bounded slower reads pass in 55.204 seconds overall, with navigation times
9058, 9030, 9134 and 9084 ms. All original assertions remain: two pages,
three distinct cards, two full descriptions, zero provider clicks, no replay
after reload, an unstarted batch draft, four languages, phone layout and
closed owned resources. Failure diagnostics retain phase, count and bounded
read timings without account or vacancy prose. Production deadlines and
discovery limits are unchanged.

The [checked archive](data/ci-vacancy-discovery-progress.tar.gz) and
[manifest](data/ci-vacancy-discovery-progress.tar.sha256.json) retain full
failed-job logs, exact-head metadata, actual parent bytes, both native probes
and focused quality checks. The successful desktop and phone renders are
preserved with hashes. Exact final-head hosted verification remains required.
This test correction accepts no additional product criterion; all 57 unchecked
inventory rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
