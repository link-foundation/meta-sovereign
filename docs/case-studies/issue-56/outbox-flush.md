# Durable reservations before provider dispatch

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Every unchecked requirement remains active.

While implementing the current-chat watcher, inspection of the text store found
that `put()` schedules a grouped flush after 200 milliseconds. The common outbox
awaited `put()` and dispatched immediately. A process interruption in that window
could lose the reservation after the provider received the action, allowing a
later restart to repeat it. This is a code-derived crash window, not a reported
live duplicate. The available store `flush()` is now awaited before dispatch.
A failed flush refuses the action; stores without that method retain their
existing contract. Receipt persistence and uncertainty handling are unchanged.

Reproduce with `python3 experiments/issue-56/outbox-flush-before.py`. It temporarily
restores actual parent `ea8d7eae`, runs two finite mock cases and restores current
source in `finally`. Both cases fail before the fix: dispatch occurs without a
durable event, and a synthetic flush failure still dispatches. Both pass with the
fix, alongside the existing focused send-safety checks. No timing loop, crash
stress, real account or full build is needed.

Run the focused regression with
`node --test --test-concurrency=1 js/tests/question-outbox-flush.test.js`.
The [hashed evidence archive](data/outbox-flush.tar.sha256.json) retains complete
before/after source, the reproducer and focused verification logs.
