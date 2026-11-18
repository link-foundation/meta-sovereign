# Consent after provider preparation

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The shared sender checked acknowledged consent before calling the adapter, but
preparation inside the adapter could still wait. A chat/person opt-out saved
during VK rate limiting or retry, Telegram connection or peer resolution, mail
thread/JMAP discovery, or SMTP greeting/recipient/DATA readiness did not prevent
the later provider request. A caller could also edit its original draft while
the shared sender was preparing the request.

The sender now snapshots the API draft before its first wait and composes the
existing optional dispatch hook with a fresh acknowledged consent read. Actual
adapters invoke that hook after their preparation waits. Telegram checks every
text part; withdrawing consent after an accepted part stops the rest and retains
the partial/unknown result. SMTP checks before DATA and after its 354 response,
before any message body is written. Refusals before issue remain definite and
cannot trigger browser fallback. Positive receipts already issued remain valid.

Run the finite regression with:

```sh
node --test --test-concurrency=1 js/tests/consent-sdk.test.js js/tests/consent-telegram-parts.test.js
```

All 73 new checks pass across fourteen offline/owned-loopback variants. The exact
published parent `dfd3213bb11acc3b5e9da66103537ff585f6e9c9` fails 48 actual assertions
with 25 controls passing, including positive issued receipts. The combined focused
selection passes all 259 checks. It preserves unreadable-setting redaction,
provider/chat/person isolation, composed hooks, accepted multipart uncertainty
and owned connection cleanup. The SMTP fixture counts the first body line as an
effect, so a partial write cannot masquerade as a safe refusal.

The initial fixture omitted a fake browser's close method and then a fake HTTP
response's JSON method; both diagnostics are retained. The expanded adapter
option contract also required the existing test to retain every payload/token
assertion while separately checking and invoking the new guard. The corrected
finite fixtures close their own connections and do not contact live providers.

Source-bound [evidence](data/consent-sdk.tar.gz) and its
[manifest](data/consent-sdk.tar.sha256.json) retain exact parent/current sources,
all initial and final focused results and unchanged static gates. Full matrices
remain hosted. This correction covers the last boundary owned by these adapters;
it does not establish cancellation inside third-party SDK queues or acceptance
of the complete provider/trigger audit. QA19 and QA20 remain unfinished; current
acceptance stays **88/118**, with all thirty remaining requirements still in scope.
