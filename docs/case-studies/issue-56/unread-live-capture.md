# Transient messages during an unread visit

The finite unread scanner already archived each history window before scrolling.
Its borrowed reply callback could remain in a conversation after that scan, but
had no live capture. On published `a5dc8de9`, a message mounted, edited twice,
marked delivered and removed during that callback never reached canonical storage.
The native regression fails with `transient unread message retained`: the saved
body is undefined. The [before screenshot](../../screenshots/issue-56-unread-live-capture/before.png)
shows the missing message and versions after the original view is restored.

The borrowed tail now attaches the existing bounded history capture before its
stable question read. The navigation adapter delegates frame-bound subscriptions
to its current verified document; capture release remains possible after owner
interruption. The existing archive callback receives each observed mutation in
order. Reads and reply admission flush that capture. At callback completion the
visit drains issued replies and captured writes, releases the observer and
subscription, then restores its owned reading position. Restoration still runs
when capture fails. A failed archive blocks a later Send, while a reply already
witnessed by the provider keeps its positive receipt.

This reuses the current-chat observer, canonical message versions, document/pane
identity checks and the existing single navigation lease. Its 64-snapshot and
2 MiB bounds, generic private-error diagnostics and default-off
`MS_BROWSER_HISTORY_DEBUG=1` tracing remain unchanged. The pinned HH recorder at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15` supplied behavior to compare; its code was
not copied or executed. Synchronous DOM states the observer never sees cannot be
reconstructed.

Reproduction and focused verification:

```sh
node --max-old-space-size=384 experiments/issue-56/unread-live-capture-browser.mjs
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/browser-conversation-tail.test.js js/tests/browser-unread-conversations.test.js js/tests/question-browser-unread.test.js js/tests/browser-history-capture.test.js
deno test --allow-all --v8-flags=--max-old-space-size=384 js/tests/browser-conversation-tail.test.js js/tests/browser-unread-conversations.test.js js/tests/question-browser-unread.test.js js/tests/browser-history-capture.test.js
```

Run the native scenario with the three production files restored from `a5dc8de9`
to reproduce the failure. The retained parent run actually did so before the
production correction. Three focused lifecycle regressions also failed before
the fix; 30 focused Node and 30 Deno checks now pass, alongside the mandatory
browser-group registration contract. The native Chromium case retains all three
versions and final delivered state, restores URL/draft/selection/scroll, releases
the observer and sends nothing. The [after screenshot](../../screenshots/issue-56-unread-live-capture/after.png)
shows its receipt. The four existing current-chat native cases still pass with
zero page exceptions, clicks or text sends. All owned native contexts close.
The existing unread-delivery CI group now includes this scenario on both engines;
WebKit retains its explicit unsupported-focus refusal. The full local matrix was
not run.

The Playwright MCP attempt to import the local host scenario fails because its
VM has no dynamic-import callback. A diagnostic confirms Node imports are
unavailable there; its blank page closes. That attempt is retained as a limitation,
not a passing MCP or independent lifecycle verification. No product UI is changed
by this host-side lifecycle correction.

The exact parent also has one hosted failure: Checks `43804735866`, lint job
`133093166174`, created at `2026-11-16T04:32:37Z` for `a5dc8de9`. The complete
23,437-line run log and 17,739-line job log are preserved. Job lines 17,714–17,720
report 50,191 duplicated lines out of 771,909, exceeding the unchanged 6.5% gate;
the error is run-log line 20,265. Its other four workflows pass. Reusing the
existing finite browser probe for four entrypoints and sharing the actual
transient-message fixture removes repeated setup while keeping assertions and
deadlines. The unchanged local gate passes after consolidation. No threshold,
exclusion, lint rule or required CI lane is relaxed.

The [checked archive](data/unread-live-capture.tar.gz) and
[byte manifest](data/unread-live-capture.tar.sha256.json) retain parent/current
source, the pinned reference, raw failures and passing logs, MCP refusal and both
screenshots. [The plan](unread-live-capture-plan.md) tracks the remaining hosted
verification. This covers capture inside the existing explicit borrowed callback;
it does not establish automatic general Q&A across all unread chats, other windows
or authenticated provider parity. HH11 and all 60 original unchecked inventory
rows remain unfinished in [PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
