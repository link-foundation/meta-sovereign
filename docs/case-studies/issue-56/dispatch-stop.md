# Stop during sender preparation

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The runner checked its owned cancellation signal after durable admission, then
called the sender without that signal. Stop during connection loading, an SDK
wait or native browser preparation could therefore still dispatch the message.
The existing autopilot fixture sent immediately at sender entry and did not
exercise those later waits.

Delivery now passes the signal as a separate dispatch argument. The shared
sender carries it through API preparation, fallback and native choice/text
paths. Its composed dispatch guard checks ownership before and after the
acknowledged consent read. A queued browser send checks again before opening
another chat. Cancellation is never added to the durable draft or outbox.
Telegram preserves the definite `stopped` refusal before the first part, and
retains partial/unknown delivery if earlier parts were accepted.

Reproduce with these finite offline/owned-loopback tests:

```sh
node --test --test-concurrency=1 js/tests/dispatch-stop.test.js js/tests/dispatch-stop-pilot.test.js js/tests/consent-telegram-parts.test.js
```

The seventy focused cases cover fourteen actual SDK variants, browser waits,
native choices, connection loading, eligible fallback, queued navigation,
settings readback, issued uncertainty and multipart receipts. The exact
published parent `2761c35bb6755c2f413f66dcb735bd8bf4e0ddc5` fails forty-five actual
assertions, with twenty-five controls passing. The combined relevant selection
passes all 383 checks with concurrency one and a bounded Node heap.

Six cases use the actual runner and autopilot with VK, Telegram and SMTP
adapters. Stop remains pending while the owned preparation/request is pending,
then drains it and leaves the autopilot stopped. Unissued work has one failed
outbox with `stopped` and zero provider effects; an issued positive request has
one sent outbox. Recursive record inspection rejects stored signals, dispatch
hooks and functions. Owned sessions, sockets and runners close in the fixtures.

An initial uncertainty assertion incorrectly required an explicit `fallback:
false` field from VK. Its existing `ambiguous` and `send-unknown` classification
already forbids fallback; the corrected assertion retains that contract and
requires exactly one effect. The original diagnostic is preserved.

Scoped lint, formatting, secrets, source/document limits and whitespace checks
pass. The unchanged duplication gate reports 6.4986%, within its 6.5% limit.
The initial lint refusal for an unqualified test global is retained; the test
now accesses the same runtime constructor through `globalThis`.

Source-bound [evidence](data/dispatch-stop.tar.gz) and its
[manifest](data/dispatch-stop.tar.sha256.json) retain the exact parent/current
sources, regression logs and static gates. Full runtime and browser matrices
remain hosted. This change verifies the boundary owned by the shared sender;
it does not establish cancellation inside third-party SDK queues or acceptance
of the complete provider/trigger audit. QA19 and QA20 remain unfinished, with
**88/118 verified and all thirty unfinished criteria still required**.
