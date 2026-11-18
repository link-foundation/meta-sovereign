# Acknowledged browser history windows

The native HH unread pass traversed bounded, overlapping history windows but
retained their rows only in memory. The review service stored the newest
question review and discarded the visited transcript. An earlier manual answer
could therefore be observed successfully and remain absent from archive learning
after the pass. The pinned HH chat requirements explicitly require collected
history and earlier owner replies to remain available across later conversations.

The unread service now supplies a checkpoint to the existing scanner. After a
window passes identity, owner, overlap and capacity checks, the scanner awaits
its save before moving or returning. The checkpoint uses the ordinary canonical
message IDs, causal writes and message-version decorator. Unchanged overlap
creates no new message revision; observed edits preserve earlier versions.
Service records and link destinations stay attached to their actual chat.
Unknown timestamps stay unknown and make that chat ineligible for adjacency
learning. No date, delivery state or missing message is inferred.

The normal store must acknowledge its flush before the window is counted. A
refused checkpoint stops traversal before another window, review or notice
reply and attempts the existing owned view restoration. Storage may already
contain valid admitted observations after a flush failure; the pass does not
claim their durable completion. Stop drains an admitted save, then releases the
browser owner. Status recovery reads saved aggregate window, observation and
changed-record counts without repeating navigation. Observation counts include
overlap; they do not claim unique-message counts or complete provider history.

This also exposed a learner privacy defect. Its private-URL guard inspected
visible message prose, while archive projection discarded hidden anchor
destinations. The shared learner now retains and validates that metadata and
excludes private or malformed targets in questions, answers and summaries. A
private outgoing continuation discards the entire pending answer, including a
preceding public fragment, so a truncated answer cannot become reusable. Public
links and legacy messages remain eligible. Stored transcript bodies are intact;
new learned proposals remain unapproved and learning still requires its existing
explicit action.

```sh
python -B experiments/issue-56/browser-history-archive-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/browser-history-archive.test.js js/tests/browser-conversation-history.test.js js/tests/question-learning-links.test.js
node --max-old-space-size=384 experiments/issue-56/browser-history-archive-browser.mjs
node --max-old-space-size=384 experiments/issue-56/conversation-history-mcp.mjs --checkpoints
```

The first command temporarily restores exact parent `77cf6add` production bytes
and restores every working source in `finally`. All six selected regressions
fail there: checkpoint ordering, refused-save stop, public unread integration,
hidden private links, answer continuation and archive projection. After the
fix, 109 focused Node checks pass, including existing sender, unread, archive,
notice and learning behavior. Inputs stay small; new asynchronous service cases
have five-second test deadlines and Node uses a 384 MiB heap.

The native Chromium fixture uses the real sender/commander and a private Lino
text store. It verifies checkpoint visibility before advancing, every one of
12 original native IDs after physical close/reopen, the earlier outgoing reply,
the application service barrier and owned URL/filter/draft/selection/scroll
restoration after a refused write. The existing mandatory history browser entry
now includes that fixture for hosted Chromium/WebKit coverage.

The separate MCP inspection bundles the production scanner and drives it in an
independent browser. Eight accepted windows produce 12 unique fixture messages;
a rejected checkpoint stops after one call and restores the original view. Its
two cases report zero page errors or provider sends. MCP checks the callback
contract with an in-memory sink; disk durability is established separately by
the native fixture. Both browsers and all owned temporary stores close.

Pinned reference: `konard/hh` revision
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`, README Answer Chats/history
requirements. Its source was inspected, never executed. The
[evidence archive](data/browser-history-archive.tar.gz) and
[byte manifest](data/browser-history-archive.tar.sha256.json) retain source
snapshots, parent failures, focused checks and raw browser receipts.

This is a bounded-pass checkpoint, not continuous DOM capture. Fast mutation
observers, browser delivery-state parity, fully automatic learning and live
provider verification remain required. HH11 and all 60 unchecked original rows
stay open in [PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
