# Retry an offered option after clearing an unsent draft

The pinned HH [chat contract](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/README.md)
requires delayed-button detection and another attempt when an owner clears an
unsent draft. These are separate actions: arriving buttons may clear only an
unchanged automation-owned draft; an edited draft must remain until its owner
clears it. Saved answer knowledge and the current question remain intact.

The production choice controller already invalidates ownership on real input,
and the sequential watcher replans after every observed snapshot. Existing
native coverage proved that edited content survived, then stopped the watcher.
It did not prove that clearing this content allowed the same watcher to select
the offered answer. This change supplies that missing check without changing
production behavior.

The focused regression starts with a draft, observes zero selections, clears
it, and requires receipt `102`, one provider opening, one selection and zero
prefills. Seventeen watch tests pass with one worker and bounded polling.

The existing isolated native scenario now edits the automatic draft, waits for
the offered options and verifies the exact retained owner text with zero
clicks or text sends. It then clears the textarea through native input, waits
for receipt `102`, stops and drains the watcher, and requires exactly one click,
zero text sends and an empty composer. All five Chromium scenarios pass with
no page errors; their server and browser contexts close before the driver
exits. The fixture uses routed provider DOM rather than a live account.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 \
  js/tests/question-browser-watch.test.js
E2E_EXECUTABLE_PATH=/usr/bin/google-chrome node --max-old-space-size=384 \
  experiments/issue-56/question-watch-ui.mjs --no-screenshots
```

The native helper remains awaited by the mandatory `question-controls` hosted
group for Chromium and WebKit. Its raw checks and source snapshots are in the
hash-verified [archive](data/option-clear-retry.tar.gz) and
[manifest](data/option-clear-retry.tar.sha256.json). This coverage addition does
not accept QA14 or any other inventory row. The complete pinned behavior,
current-source comparison and hosted results remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
