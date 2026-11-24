# Await real signaling before browser sync assertions

Hosted [Checks 43254148533](https://github.com/link-foundation/meta-sovereign/actions/runs/43254148533)
for published `2389fc8e` fails in WebKit shard 4, job `131312063036`, at
2026-11-12 16:27:29 UTC. Full raw job log lines 1163–1170 show the second peer
finishing an offline boot, rediscovering the same isolated server and reloading;
the convergence loop then calls `__msApi.get` while the new document has no API.
The first peer has no partner transport yet. This is a missing test precondition,
not evidence of an assertion about the data channel failing after connection.

`preparePeer` (now shared as `prepareSyncPeer`) previously waited for API presence and called status. Both succeed
on an offline page. The fixture now waits for a synchronously observed open
`/rtc` WebSocket with the negotiated `meta-sovereign-sync.lino.v2` protocol.
Playwright follows any production rediscovery navigation before this condition.
The 20-second readiness bound is separate from the unchanged 20-second data
convergence deadline; no existing deadline, error policy or assertion is weakened.

The mandatory sync scenario interrupts exactly the second isolated peer's first
same-origin discovery probe. It uses the production fallback, retry and reload,
then asserts an actual reload occurred before verifying real WebRTC convergence,
typed Unicode/arrays, deletion, secret exclusion, Lino signaling/SDP and no server
record write. Sockets, signaling and the data channel remain real. The fixture's
existing WebKit mock microphone workaround stays isolated and is stopped on exit.

The actual-parent replay inserts only that one failed probe into published
`2fb595e1`'s sync scenario, preserving its original preparation/assertions and
restoring the working file unconditionally. It fails during rediscovery with a
destroyed context or missing API. The corrected scenario passes WebKit and records
`interrupted: true` plus multiple document navigations.

Two intermediate readiness attempts are preserved. An async `waitForFunction`
predicate was accepted too early: the installed Playwright predicate runner tests
the returned promise's truthiness before its result. Its source is retained in the
archive as implementation evidence. The final predicate is synchronous. An audit
found one other async predicate, in the SPA's WebRTC read loop. It now uses a
bounded helper that awaits each browser read, accepts only a truthy resolved value
and propagates actual read errors. Both browser tests share the same signaling and
isolated WebKit mock-device preparation; the SPA convergence step is extracted so
it can be run alone without running the full suite. Three focused Node/Deno checks verify delayed
success after two false values, finite failure and exception propagation.

```sh
python3 -B experiments/issue-56/lino-sync-readiness-before.py
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit CI_LINO_SYNC_DEBUG=1 node js/tests/e2e-lino-sync.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node experiments/issue-56/lino-sync-spa-readiness.mjs
node --test --test-concurrency=1 js/tests/e2e-browser-value.test.js
deno test --parallel=1 --allow-all --no-check js/tests/e2e-browser-value.test.js
```

Only the two affected native sync scenarios are run locally, one at a time. The full SPA/browser/runtime
matrices remain hosted CI work. Scoped formatting/lint/secret checks pass. Native
contexts, media and servers are closed. Existing default-off content-free sync
tracing is retained; the only additional socket diagnostic is a boolean identifying
the `/rtc` path, with no SDP, ICE addresses or owner data logged.

`data/ci-lino-sync-readiness.tar.gz` and its manifest retain complete failed-parent
job logs, timestamps/head metadata, replay failure, intermediate attempts, passing
native and focused logs, source snapshots and the relevant installed predicate
runner excerpt. GitHub's `gh pr diff` returns HTTP 406 because the PR exceeds the
300-file diff cap; file-list pagination reaches the API's 3,000-file limit. Local
Git diffs are required for complete review; these responses are preserved without
claiming they contain the whole PR.

Exact new-head hosted checks and every unchecked issue #56 feature remain
required. This test correction does not complete any unmet product criterion.
