# Preserve reply-fixture turn order on busy runners

Checks run `43705703714` at published `05bcbddd` failed macOS Node shard
2/8, job `132787204838`. The full preserved job log reports 812 tests,
810 passing, one platform skip and one failure. Lines 1696–1719 identify
`vk-contextual.test.js:153`: clarification planning returned no draft instead
of one. The assertion itself took 14 ms; this was not a test deadline failure.

The shared message fixture sampled `Date.now()` on every call. Creating an
“older” message after a pause of two seconds or more could place it beside or
after the already seeded outgoing/incoming turns. The production planner
correctly refused the changed adjacency. The fixture now captures its clock
origin once, so its explicit logical IDs determine order throughout setup
and assertions. Production ordering and ambiguity checks are unchanged.

`vk-reply-fixture.test.js` advances a mocked clock by a finite three seconds.
It fails against the actual parent fixture, then passes with the correction,
including actual clarification planning and a fractional intervening turn.
Twenty-four focused Node and 24 Deno reply/fixture tests pass. The full
runtime matrix remains hosted.

A separate macOS shard 3/8 was cancelled before completing “Set up job”. Its
API metadata lists no executed test step, and its annotation reports the job
deadline. The attempted log download returned `BlobNotFound`; that response
and the exact metadata are retained, without attributing the infrastructure
failure to a test or extending deadlines.

The [checked archive](data/ci-reply-fixture-clock.tar.gz) and
[manifest](data/ci-reply-fixture-clock.tar.sha256.json) preserve the actual
parent bytes, regression, full failing job log, metadata and focused results.
New exact-head hosted checks remain required. Every unfinished issue criterion
stays active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
