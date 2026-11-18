# Persisted legacy VK priority lists

The pinned desktop configuration uses empty bare-key lists and numeric singleton
lists. The friends policy accepted null, empty text and numeric singletons, but
rejected an empty object. Cleanup, outgoing cancellation and the common personal
policy reader also passed legacy values straight to strict write validation.
Consequently an otherwise valid saved cleanup policy failed before preview.

The finite regression restores the exact `3e70de44` production settings files.
Three cases fail: a saved empty friends list, an actual cleanup preview, and a
text-store reopen. Two existing strict-write checks still pass. The helper always
restores the working sources, including on failure.

```sh
python3 -B experiments/issue-56/legacy-priority-before.py
node --test --test-concurrency=1 js/tests/vk-legacy-priorities.test.js
node --test --test-concurrency=1 js/tests/vk-friend-priority.test.js js/tests/vk-maintenance.test.js
```

Persisted reads now share the same conversion: absent, null, empty text and an
empty plain object become an empty list; a positive safe numeric singleton
becomes a one-item list. Arrays retain strict validation and deduplication.
Populated objects, numeric strings, nonpositive IDs and mixed arrays refuse
instead of silently losing potentially protected users. New saves remain strict
and do not acknowledge or write these legacy shapes. Reading never rewrites the
saved record. This is intentionally narrower than the reference's conversion of
every object to an empty list.

Five new focused checks pass. They cover all twelve primary policy readers plus
the cancelled-request reader, strict new writes, unchanged saved records,
singleton protection during actual cleanup/cancellation, and real text/binary
Lino flush and reopen. Twenty-four existing priority and maintenance checks also
pass. Strict lint passes and the web bundle is rebuilt because shared offline
policy readers import these settings modules. No UI layout or provider session
changes. The full platform/runtime matrix belongs to hosted CI.

Two early fixture errors are retained: a guessed binary-store import and a call
to a nonexistent binary `close()` method. Neither counts as a product failure.
The final reproducer uses the actual Doublets store and its `flush()` lifecycle.
The helper also now requests TAP explicitly so its counts do not depend on
Node's default reporter.

Pinned source snapshots come from `konard/vk-bot-desktop` at
`8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`. This completes the local legacy-priority
read correction, not every desktop configuration list or VD07. VD12 still needs
exact-head hosted acceptance. All 60 unchecked inventory rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/legacy-priorities.tar.gz),
[hash manifest](data/legacy-priorities.tar.sha256.json).
