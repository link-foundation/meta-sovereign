# Pending draft ownership (QA20)

At parent `d517e9d4`, the planner excludes drafts already visible in its input
snapshot, but that snapshot can precede an owner's edit or another run. The
final queue checks existing pending drafts only for model output. Ordinary
templates and saved answers can therefore overwrite a pending owner draft.
Two concurrent queue calls can also replace the first pending preview.

Reproduce with `js/tests/draft-ownership.test.js`: compute an ordinary plan,
save a pending draft with owner wording, then queue the earlier plan. The
parent returns and stores automatic wording instead. The second regression
queues two previews concurrently and demonstrates replacement of the first.
Both fail against the unchanged parent implementation.

The shared queue now checks pending drafts for every action and returns the
existing record without rewriting its wording, form or creation time. Queue
writes serialize per store using the existing recoverable operation queue.
Model validation remains in place for new model drafts. Planning and owner
editing stay outside the queue. This shared function is used by the server
runner, offline browser automation and reviewed-delivery fallback paths.

The focused command passes **37 tests** with one worker, including both new
ownership regressions over HH, Telegram, VK, email and WhatsApp identities,
fresh previews, a refused write followed by successful retry, existing safe
and automatic modes, model invalidation, CLI and Lino workflows:

```sh
node --test --test-concurrency=1 js/tests/draft-ownership.test.js js/tests/automations.test.js js/tests/chat-answer-model.test.js
```

These are portable shared-store tests with synthetic senders. They do not
establish live provider delivery or full provider-specific safeguard parity.
The web bundle is rebuilt, scoped lint/format and source/documentation limits
pass, and the existing duplication and secret checks retain their rules.

The [checked source/log archive](data/draft-ownership.tar.gz) and
[per-file manifest](data/draft-ownership.tar.sha256.json) preserve the parent,
regressions and verification logs. Hosted verification remains required.
QA20 remains unfinished; the inventory stays **83 of 118 accepted, 35 required**
in [draft PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
