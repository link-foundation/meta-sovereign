# Native HH browser delivery observations

The browser reader previously used sent/delivered/read icons to infer outgoing
direction, then discarded the icon state. A pending or failed outgoing bubble
could look incoming, and legacy outgoing history could supply an answer without
positive delivery evidence. A conflicting sent/failed bubble could also confirm
a dispatched native choice. This violates HH11's distinction between an observed
owner message and its actual delivery state.

The reader now retains direction separately from delivery. Native outgoing
selectors follow the pinned reference contract; geometry never establishes
ownership. Exactly one recognized status produces pending, failed, sent,
delivered or read. Absent, unfamiliar or conflicting status evidence remains
unknown. Incoming rows carry no outgoing delivery claim. These optional selector
states are verified against provider-shaped fixtures; authenticated HH parity
has not been established.

Normalization and canonical history checkpoints retain the observation. Pending,
failed and unknown answers cannot become reusable proposals or confirm a send.
A later positive native status can acknowledge the original attempt without
another click. Delivery changes update the canonical message without inventing
text versions. Other providers retain their existing direction contract.

Migration 0021 marks only legacy outgoing HH browser records without delivery as
unknown. It preserves bodies, IDs, timestamps, immutable text versions, API and
other-provider records, and saved owner knowledge. Re-reading a positive native
status replaces uncertainty. Dry runs count without writing; repeat runs are
idempotent. Read-only legacy stores are protected too: the learner checks browser
provenance, including its archive projection, without requiring migration writes.
Previously saved answers are not retroactively removed or reapproved.

```sh
python -B experiments/issue-56/hh-delivery-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/browser-message-state.test.js js/tests/browser-history-archive.test.js js/tests/migrations-hh-browser-delivery.test.js js/tests/migrations-registry.test.js js/tests/browser-conversation-history.test.js js/tests/browser-choices.test.js js/tests/question-browser-watch.test.js js/tests/browser-sender.test.js js/tests/question-learning.test.js js/tests/question-archive.test.js
node --max-old-space-size=384 experiments/issue-56/hh-delivery-browser.mjs
```

The first command restores exact parent `bea3183e` production bytes temporarily
and restores every working file in `finally`. Three focused regressions and
three native browser scenarios fail there. The draft passes all 88 focused
checks and eight native history scenarios, including eight delivery combinations,
uncertain receipt refusal and delayed acknowledgement with one click and zero
text sends. All local checks use one test worker and a 384 MiB Node heap.

An independent Playwright MCP inspection uses the production composed reader in
a synthetic cross-origin application frame. Eight states remain distinct, a
pending bubble returns send-unknown, and changing its native icon to read confirms
message 102 on the same attempt. It reports one native fixture click, zero text
sends and no page errors. The owned browser and loopback fixture server close.

The [evidence archive](data/hh-browser-delivery.tar.gz) and
[byte manifest](data/hh-browser-delivery.tar.sha256.json) preserve actual-parent
failures, final source bytes, focused/native/MCP receipts and bounded validation.
The pinned reference is `konard/hh` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`; inspected source remains read-only
and was never executed.

This change observes delivery during existing reads. Continuous rapid-mutation
capture, pane identity tracking, authenticated provider parity and every other
unchecked criterion remain required. HH11 remains unchecked among the 60 open
inventory rows. Exact-head hosted checks remain required; unrelated browser
launch and disclosure failures are tracked separately in
[PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
