# Wait for the signaling offer

The RTC server integration test now waits for its expected offer instead of
assuming native WebSocket delivery finishes within 30 ms. It retains the same
payload assertion, uses the existing bounded predicate helper and closes its
clients and server even after an assertion fails. Production signaling behavior
and the other transport assertions remain unchanged.

## Hosted failure and bounded reproduction

Checks run `43600700798`, head `c976dc98`, started 2026-11-14 at 13:37:29 UTC.
Ubuntu Deno job `132465586330` reports 5,687 passing tests, one failure and eight
ignored tests. Its complete 8,896-line log identifies the missing expected offer
at lines 8859–8872. The log does not measure the original offer's delivery delay.

`experiments/issue-56/signaling-delivery-probe.mjs` delays only native Deno
WebSocket message callbacks by 120 ms. Handshakes, server routing and payloads
still use the actual integration. Pending callback timers are cleared when the
owned sockets close. The actual published parent's 30 ms assertion fails under
this finite delay; the corrected assertion passes.

Run `python3 experiments/issue-56/signaling-delivery-before.py` to reproduce the
failure. Its temporary parent test adds cleanup and a five-second test deadline
around the original sleep/assertion, then restores the working file in `finally`.
This is a bounded parent assertion reproduction with an explicit cleanup harness,
not a claim that the hosted run's unmeasured latency was exactly 120 ms.

## Verification and remaining work

The delayed native-Deno probe passes. All nine focused server-sync and signaling
tests pass in Node and Deno, including REST coexistence, room isolation, text and
binary peers, authoritative sender identity and departure. Formatting, strict
lint, secret checks and the unchanged duplication gate also pass.

`data/ci-signaling-delivery.tar.gz` and its SHA-256 manifest retain the published
parent source, hosted job log, failing probe, passing probe and focused checks.
Exact new-head hosted checks remain required. The separate WebKit disclosure
failure and macOS cancellation remain under investigation. All 81 original
inventory rows remain unchecked; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
