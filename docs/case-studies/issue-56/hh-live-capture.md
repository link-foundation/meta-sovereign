# Confirmed current-chat browser capture

The existing watcher polled the mounted tail, and the archive scanner saved only
explicitly visited windows. An edited message removed between polls disappeared
without a canonical record. The reader also trusted a route before recording
which conversation had already owned a native message ID. An SPA could change
its URL before replacing that pane.

Confirmed watches now install a document-owned MutationObserver. Its callback
reads message facts immediately in the provider document, rather than scheduling
a later read of a possibly replaced DOM. Only changed rows are sent through a
frame-bound subscription. Canonical writes acknowledge in order and retain text
versions and native delivery corrections. The existing shared watch service
connects this path for CLI, text/binary Lino and the translated Questions, Chat
and Operator controls; status and repeated start IDs never resume capture.

Previously observed native message IDs retain their chat owner. Complete observed
HH employer/vacancy header facts also must match; temporarily absent facts do
not prove a new owner. Incomplete initial hydration and empty mounts do not freeze
invented metadata. The guard records at most 20,000 IDs and 512 complete headers
per document, then refuses additional ownership rather than silently evicting it.
It cannot prove a never-observed pane's identity or authenticated provider parity.

Page and host each bound admitted data to 64 pending snapshots and an estimated
2 MiB of serialized UTF-16 text. A gap or failed save disconnects capture and
refuses subsequent automation. Stop drains admitted writes, releases subscriptions
and reports capture failure even when first discovered during Stop. A page has
one exposed binding; released subscribers and foreign frames cannot write.
Provider navigation still invalidates the existing document owner. No polling
timer, navigation or provider action is added by the observer.

`MS_BROWSER_HISTORY_DEBUG=1` enables only source, phase, pending count and generic
error codes. Diagnostics and rejected page callbacks omit private error causes,
message bodies, tokens, drafts and URLs. The default is off.

The pinned reference is `konard/hh` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`. Its recorder, history writer and
pane-transition guard were inspected as behavioral evidence, never executed or
copied. This implementation uses the repository's canonical causal storage.

Verification is recorded in [the work plan](hh-live-capture-plan.md). Run the
focused checks with one worker and a 384 MiB Node heap:

```sh
python -B experiments/issue-56/hh-live-capture-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/browser-pane-identity.test.js js/tests/browser-history-capture.test.js js/tests/question-browser-watch.test.js js/tests/browser-history-archive.test.js js/tests/browser-choices.test.js
node --max-old-space-size=384 experiments/issue-56/hh-live-capture-browser.mjs
```

The exact published parent `7973fe42` fails two shared-service checks and all four
native cases; every production file is restored in `finally`. The draft passes
41 focused checks, 40 related watch, inactive-view and history checks, and two
existing session-close checks. The
four native cases verify short-lived edits/delivery, URL-before-pane transition,
changed header refusal and archive failure before prefill. Shutdown closes its
browser session even when capture reports a refused save.

Independent Playwright MCP inspection runs the production composed page observer
and canonical writer in a routed cross-origin application frame. It retains all
three versions and final delivered state, confirms Stop prevents later writes,
then observes a sticky failed-save refusal. It does not substitute for the
production host capture controller; that path is covered by the native sender
cases. Inspection reports zero provider clicks, zero text sends, zero page errors
and zero console errors or warnings. Its observer, browser and loopback server
close. All provider requests are routed fixtures; no live account is used.

The [checked archive](data/hh-live-capture.tar.gz) and
[byte manifest](data/hh-live-capture.tar.sha256.json) preserve parent/current
source, raw logs, pinned read-only source and the focused/MCP receipts. The
mandatory provider browser workflow runs these native cases on Chromium and
WebKit; local validation does not repeat that full matrix.

This is the confirmed document's mounted-message capture. MutationObserver may
coalesce synchronous changes; intermediate states it never observes cannot be
reconstructed. Other windows, automatic all-unread orchestration, authenticated
provider validation and every other incomplete requirement remain required.
HH11 stays unchecked among 60 open inventory rows. Hosted acceptance must be
checked for the exact published commit in
[PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
