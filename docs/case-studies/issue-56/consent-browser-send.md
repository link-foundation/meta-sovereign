# Current consent during browser sends

PR: https://github.com/link-foundation/meta-sovereign/pull/57

At published parent `79addf4d`, browser delivery checks consent before entering
the transport. Session/login, the shared source queue, composer focus, typing and
native button lookup can still wait after that check. An acknowledged chat or
person opt-out during those waits does not prevent the actual send.

The shared plain-message browser sender now reads acknowledged consent before
opening its session, after composer focus and after the native button lookup.
The final guard runs outside the issued-action uncertainty handler: a refusal
before dispatch remains definite, prevents fallback and sends nothing. Unreadable
settings produce the existing redacted `safety-settings-unavailable` refusal.
The browser's existing `to` projection retains its person identity for this guard.

No check after dispatch rewrites an already-issued result. Positive receipts
remain successful; an issued native action without a receipt remains uncertain.
Existing provider/chat/person isolation, prefilled WhatsApp URLs, text/fill modes,
shared queues, non-consent browser actions and owned-session closure remain intact.

Reproduce the actual-parent failure and verify the correction without a browser
or network provider:

```sh
node --test --test-concurrency=1 experiments/issue-56/consent-browser-send-parent.mjs
node --test --test-concurrency=1 js/tests/consent-browser-send.test.js js/tests/consent-provider.test.js js/tests/browser-sender.test.js
```

The parent fails 28 assertions with five controls passing. The corrected focused
run passes 79 tests with zero failures or cancellations. Each race uses a finite
promise barrier and a five-second test deadline, drains all sends and closes its
owned session. The initial WhatsApp fixture used an invalid recipient and timed
out before the intended barrier; a valid phone plus early-completion detection
corrects the fixture. The final parent failures are actual assertion failures.

The [source/log archive](data/consent-browser-send.tar.gz) and
[manifest](data/consent-browser-send.tar.sha256.json) preserve exact parent and
current sources, final checks and the initial fixture diagnostics. Scoped lint,
format, secrets and source/document limits pass without warning suppression.
Full runtime/browser matrices run in hosted CI.

This unit covers shared plain browser messages. Native answer choices, watched
text replies and provider-internal SDK waits still require their own current
consent review. Complete provider-trigger verification and all other unfinished
issue requirements remain required. QA19/QA20 stay unfinished: **88 verified / 30
unfinished**; PR57 stays draft and unmerged.
