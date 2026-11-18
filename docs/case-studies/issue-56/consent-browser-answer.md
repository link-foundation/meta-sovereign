# Current consent for native browser answers

PR: https://github.com/link-foundation/meta-sovereign/pull/57

Parent `5565c348` checks plain-message consent, but native answer choices and text
replies can still dispatch after an acknowledged opt-out during session opening,
document resolution or native arming. The same gap affects choices, text and
inactive text in an already owned answer watch. A mutable caller draft can also
move the plain sender's later consent lookup away from its original recipient.

The browser factories now bind the original provider, chat and person once, and
check acknowledged settings through the existing final native dispatch guard.
That guard executes before and after arming. It retains cancellation and document
ownership checks after the asynchronous settings read, so Stop cannot be lost
while consent is loading. Unreadable settings remain a definite redacted refusal;
the armed action is released and no provider click occurs.

Existing positive receipts remain successful when consent changes after dispatch.
Separate provider/chat/person scopes still work. Read-only question inspection
remains available after consent is withdrawn. The inactive history reader is
extracted unchanged to keep the watch factory within its function-length limit.

Reproduce and verify with finite fake native sessions, without a provider/network:

```sh
node --test --test-concurrency=1 experiments/issue-56/consent-browser-answer-parent.mjs
node --test --test-concurrency=1 js/tests/consent-browser-answer.test.js js/tests/consent-browser-send.test.js js/tests/consent-provider.test.js js/tests/browser-choices.test.js js/tests/browser-text-reply.test.js js/tests/browser-text-admission.test.js js/tests/browser-answer-watch.test.js js/tests/browser-sender.test.js
```

The exact parent fails 44 assertions with ten independent controls passing. The
corrected focused run passes 151 checks, with no failures or cancellations. The
54 new cases cover five dispatch paths, three awaited phases, chat/person opt-outs,
positive receipts, unreadable settings, scope isolation, read-only inspection,
mutable caller identity and Stop during the settings read. Each has a five-second
deadline and drains pending work, owned watches, sessions and page listeners.

The [source/log archive](data/consent-browser-answer.tar.gz) and
[manifest](data/consent-browser-answer.tar.sha256.json) preserve exact parent and
current bytes, focused results, source review and scoped static checks. Initial
function-length diagnostics are retained; the final lint check has no warnings.
Full platform/browser matrices remain hosted checks.

Provider-internal SDK waits and the complete provider-trigger consent audit still
require verification. This is supporting evidence for unfinished QA19/QA20, with
**88 verified / 30 unfinished**. PR57 remains draft and unmerged.
