# HH CLI fixture shutdown and macOS Deno diagnostics

PR [#57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft. This is a test-fixture ownership correction and recurrence instrumentation; the original hosted timeout is still unexplained.

## Hosted evidence

Published `6899b33b04535da1650c150d3a95993b91d793cd` started main run [43579541371](https://github.com/link-foundation/meta-sovereign/actions/runs/43579541371) at 2026-11-14 09:13:37 UTC. Its [macOS Deno job](https://github.com/link-foundation/meta-sovereign/actions/runs/43579541371/job/132403292910) fails the real HH source-pull CLI test after 15 seconds. In the preserved 11,248-line job log, lines 5756–5763 show three CLI initializations within 35 ms followed by the timeout. Lines 11201–11215 report 5,565 passing cases and one failure. Those initializations do not establish that all three pulls, storage verification or fixture closure completed.

The unmodified finite Linux Deno probe completes the three real CLI calls, verifies the persisted outgoing message and closes the provider in 2 ms. It does not reproduce the macOS failure. A partial HTTP header also fails to reproduce a wait on this Linux Node runtime; both observations are retained.

## Bounded ownership experiment

`experiments/issue-56/hh-cli-close-probe.mjs` uses an isolated temporary dual store and the existing local HH provider fixture. After three real CLI calls and persisted-state verification, `--unfinished-request` adds one accepted HTTP request whose response deliberately remains unfinished. The probe observes closure for only 500 ms, destroys its own sockets, awaits the close callback and removes its temporary store before exiting. It does not contact a live provider or the user's server.

With the old `provider.close(callback)` expression, this controlled unfinished response keeps closure pending through the observation window. `--owned-close` instead uses the existing `fixtureServerClose` helper, which tracks accepted connections before listening and drains only those owned sockets. It closes promptly without waiting for the unfinished client. This demonstrates a fixture cleanup defect, not the scheduling or network state of the original macOS failure.

The HH CLI test now reuses that helper. Cursor persistence, resumed and restarted history counts, outgoing-message verification and the 15-second test deadline remain unchanged. Its private directory is removed even when closing fails. Default-off `MS_LIFECYCLE_DEBUG=1` phase markers distinguish provider requests/responses, each completed CLI call, store open/close and final cleanup. Existing hosted non-Linux jobs already enable that flag. Markers contain no tokens, URLs, paths or message content.

## Focused verification

Run the existing HH controls and fixture-ownership regressions with limited local concurrency:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/hh-common-controls.test.js js/tests/fixture-server.test.js
deno test --allow-all --no-check --v8-flags=--max-old-space-size=384 js/tests/hh-common-controls.test.js js/tests/fixture-server.test.js
```

Both runtimes pass all five focused tests. The existing TCP and HTTP regressions assert closure with unfinished clients. The controlled CLI probes separately preserve before/after phase timings on Node and Deno. No local full suite or runtime/browser matrix was run.

The [checksummed evidence archive](data/ci-hh-cli-fixture.tar.gz) retains source snapshots, the original complete job log and finite experiment/test logs; its [manifest](data/ci-hh-cli-fixture.tar.sha256.json) verifies every archived byte. Exact-head hosted verification remains required. Passing a later run alone will not establish the original timeout's root cause. All 81 unchecked original inventory criteria remain required.
