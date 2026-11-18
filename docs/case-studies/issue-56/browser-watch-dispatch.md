# Watched replies recheck ownership at dispatch

The actual `f0b3ea33` watched adapter checks ownership before it calls the common
reply dispatcher. Its strict-choice and foreground text methods omit the
dispatcher's verifier, however. If Stop, navigation or a changed answer policy
arrives while the provider control is being armed, that dispatcher still clicks.
The page-local frozen-question guard cannot observe a host-side Stop or policy
change, and same-URL navigation can invalidate the watch independently of its
document identity.

The new focused regression runs the real watched adapter with a synthetic owned
document. It pauses arming, changes one of those three conditions and verifies
zero native clicks, released hooks and exactly one drained watch release. All
six refusal cases fail on the parent with `Missing expected rejection`; both
already-issued receipt cases pass. An initial fixture-only failure to observe
the document's direct release path was corrected before this baseline and its
raw log is retained separately.

Both watched methods now pass their existing verifier into the common dispatcher.
Strict choices forward it through `selectBrowserAnswer`, so the same guard runs
before arming and before native issue. Frozen question, option and provider
receipt checks remain shared. Stop after a click still drains the outstanding
receipt and preserves confirmed delivery without issuing again.

Focused verification:

```sh
node --test --test-concurrency=1 --test-timeout=30000 js/tests/browser-answer-watch.test.js js/tests/browser-choices.test.js js/tests/question-browser-watch.test.js
deno test --allow-read --allow-write --allow-env --allow-run --allow-sys --node-modules-dir=manual js/tests/browser-answer-watch.test.js js/tests/browser-choices.test.js js/tests/question-browser-watch.test.js
```

All 30 tests pass in each runtime, including eight new adapter cases and existing
choice, outbox, recovery and watch lifecycle checks. Changed-file lint, format,
secret scanning and the unchanged duplication gate are recorded in the archive.
The tests use no real account, browser profile or network and run no local full
suite or platform matrix. Exact-head hosted acceptance remains required.

This fixes a QA14/QA20/HH11 dispatch prerequisite. General unread answers, the
first-unresolved-chat review hold and application-child integration remain
unfinished. All 60 unchecked inventory rows retain their complete scope in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/browser-watch-dispatch.tar.gz) and
[hash manifest](data/browser-watch-dispatch.tar.sha256.json).
