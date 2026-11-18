# Consent after connection loading and before fallback

PR: https://github.com/link-foundation/meta-sovereign/pull/57

At published parent `72dc9552`, the shared default sender resolves saved
connection options after durable admission. An opt-out acknowledged during that
wait still reaches the adapter. A definitely refused API can likewise enter
browser fallback after the owner has withdrawn consent. The earlier
[admission correction](consent-admission.md) does not cover these later waits.

The shared acknowledged-consent guard now runs after connection resolution and
before entering browser fallback. Server, CLI and additional Telegram account
senders receive their actual shared store. The browser configuration store
remains a compatible default. A current chat/person refusal retains `opted-out`;
unreadable settings retain `safety-settings-unavailable`, with a redacted error.
Both are definite refusals that cannot trigger another transport. The same guard
also protects default strict-choice entry and existing durable admission.

The outbox records a definite failure when no transport was entered. Explicit
removal of the refusal permits a separately requested send under the existing
reservation rules. Provider/scope isolation, resolved source options, eligible
explicit browser fallback and a positive receipt already returned by the API
remain intact. No owner draft, automatic retry or UI control changes here.

Reproduce and verify without contacting a provider:

```sh
node --test --test-concurrency=1 experiments/issue-56/consent-provider-parent.mjs
node --test --test-concurrency=1 js/tests/consent-provider.test.js js/tests/consent-admission.test.js js/tests/send-adapter-options.test.js js/tests/browser-sender.test.js js/tests/browser-choices.test.js js/tests/send-safety.test.js js/tests/telegram-extra-accounts.test.js
```

The actual parent fails fourteen assertions with three controls passing. All
112 focused checks pass after the correction. Five-second regression deadlines
bound promise barriers across HH, Telegram, VK, email and WhatsApp identities;
each fixture drains its send and closes its owned resources. Browser fallback
checks use the three supported browser networks and explicit confirmation.
Lint retains exactly the parent's existing 163-line browser-factory warning;
this change adds no warning and does not suppress the repository rule.

The [source/log archive](data/consent-provider.tar.gz) and
[manifest](data/consent-provider.tar.sha256.json) preserve the reproduction,
focused checks and scoped static gates. These are transport-entry checks with
finite adapters, not authenticated delivery or atomic cancellation inside a
provider SDK. Later SDK/browser waits and complete provider-trigger verification
remain required. QA19/QA20 stay unfinished: **88 verified / 30 unfinished**;
PR57 remains draft and unmerged. Full runtime/browser matrices run in hosted CI.
