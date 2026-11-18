# Consent saved during send admission

The shared sender checked chat/person opt-outs before writing and flushing its
durable reservation. At parent `c31f12c1`, a settings change acknowledged during
that wait was ignored when the sender started. The same path is used by shared
automations, greeting, broadcast and conversation-answer owners.

After persistence, the sender now reads the current acknowledged safety record
again. A newly opted-out target receives a definite `opted-out` failure before
the sender is called. An unreadable safety record also refuses delivery. An
earlier caller-supplied settings snapshot cannot override the current refusal.
The read waits for pending settings writes and their rollback before deciding.

The reservation is retained as failed when that acknowledgement can be saved.
If settlement fails, its original `sending` record continues to prevent replay
and becomes unknown during ordinary restart recovery. Explicit removal of the
opt-out permits a separately requested send only when no uncertain reservation
remains. Already acknowledged sends retain their positive receipt. Refusals
emit a fixed-name diagnostic through the existing optional logger, which is
silent by default; no background retry or provider owner is started.

Reproduce and verify with focused, single-worker checks:

```sh
node --test --test-concurrency=1 experiments/issue-56/consent-admission-parent.mjs
node --test --test-concurrency=1 js/tests/consent-admission.test.js js/tests/safety-settings-acknowledgement.test.js js/tests/safety-person.test.js js/tests/send-safety.test.js
```

The exact parent fails fourteen checks and passes two compatible controls.
The repaired source passes all 55 focused checks. The regressions cover chat
and person refusals across HH, Telegram, VK, email and WhatsApp identities,
older settings snapshots, accepted/rejected acknowledgement waits, exact
provider/scope isolation, unreadable settings and failed settlement recovery.
Provider callbacks are finite stubs. These checks prove shared admission
behavior; they do not establish authenticated provider execution or eliminate
later provider-specific waits. Existing native UI is unchanged.

Sources, actual-parent failures, focused results and static checks are retained
in the [evidence archive](data/consent-admission.tar.gz) and its
[manifest](data/consent-admission.tar.sha256.json). Full runtime and browser
matrices remain hosted checks. QA19/QA20 stay unfinished: the inventory remains
**88 verified / 30 unfinished**, and [PR57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
