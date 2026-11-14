# Keep the native survey scenario in a bounded browser group

Checks run `43640819417` for published `21b7afcb` started at
2026-11-14 21:04:13 UTC. Its workflow-contract job `132588015295` fails at
complete job-log lines 635–650: `job-application-policies combines 5 native
scenarios`. The four-scenario contract correctly refuses the added survey
scenario. The expected exact-once scenario inventory also needed its new name.
The full 21,415-line workflow log and complete job log are preserved in the
[checked archive](data/application-feedback-shard.tar.gz), with
[per-file hashes](data/application-feedback-shard.tar.sha256.json).

The survey now has its own mandatory `job-application-feedback` entry, appended
to the shared browser registry. The original policy group retains its four
scenarios. The exact-once inventory includes the survey. Chromium and WebKit,
four disjoint shards, the 35-minute job deadline and 180-second per-entry bound
remain unchanged. No native scenario or assertion is removed.

Run `node --test --test-concurrency=1 js/tests/ci-browser-shards.test.js`.
The published configuration fails one of five checks; the corrected registry
passes all five, including actual partition execution and failure propagation.
Scoped lint passes. Native survey behavior was already verified by the focused
browser/MCP scenario in [the survey case study](application-feedback.md); the
new entry's complete engine coverage runs in hosted CI.

All 81 original incomplete inventory rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
