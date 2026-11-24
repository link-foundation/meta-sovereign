# Completed unread receipts and the active viewport

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains
unfinished and unmerged. Published `236f42a740f35f8452279110f5679411815f628c`'s
[Chromium shard 2](https://github.com/link-foundation/meta-sovereign/actions/runs/43526696270/job/132238675692)
fails `question-unread-polling`. The preserved 1,897-line job log records the
scenario failure at line 1573, the assertion at line 1633 and the failed-check
summary at line 1838. At lines 1644–1645 the list scroll is 0 instead of 100.
The route, owner draft, backward selection, composer scroll, message scroll
and zero send count agree. The complete 30-file browser artifact contains
logs and a summary, with no screenshot image.

The UI's completed-pass count is a durable receipt. It can still show two
completed passes when a third native pass starts moving the inactive list.
The test previously compared that receipt with a live viewport without
establishing a completed-pass boundary. An unchanged local Chromium run
passes all five cases, so an ordinary local pass does not explain the hosted
scheduling. The original hosted log does not directly capture the third
pass's native phase.

The bounded regression now holds the third native filter change after it has
moved the list to 0. Both earlier native pass snapshots retain the exact
original owner state and positive restoration receipts. Running the exact
published assertion with only this fixture scheduling instrumentation
reproduces the same 0-versus-100 failure. This establishes the invalid test
assumption without claiming a separately observed hosted scheduling cause.

The corrected test verifies both completed native snapshots and the complete
live owner state after the third native restoration. That third pass remains
held before returning to its polling owner until the real owner tab regains
focus. The next admission must report owner-active without stealing focus or
visiting another chat. Stop/drain, reload recovery, shared Chat/Operator
recovery, exact visits and zero page-error checks remain mandatory. All
fixture gates have a finite ten-second bound and unconditional release.
Production algorithms, provider ownership checks and existing deadlines are
unchanged. The unsupported-native-focus path remains checked by hosted
WebKit; full local matrices are not run.

Reproduce and verify:

```sh
python3 -B experiments/issue-56/unread-polling-boundary-parent.py
RUN_BROWSER_E2E=1 E2E_BROWSER=chromium E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome node --max-old-space-size=384 js/tests/e2e-question-unread-polling-browser.mjs
node --max-old-space-size=384 --test --test-concurrency=1 --test-timeout=20000 js/tests/question-unread-polling.test.js js/tests/ci-browser-shards.test.js
```

The parent experiment restores the current test bytes in finally. The final
Chromium scenario passes five cases with no page errors, and all 16 focused
Node checks pass. Scoped lint, format, secret scanning and diff checks pass.
The unchanged duplication gate remains at 6.48%. The
[archive](data/ci-unread-polling-boundary.tar.gz) and
[manifest](data/ci-unread-polling-boundary.tar.sha256.json) retain the full
hosted failure, downloaded artifact, source snapshots, parent failure and
focused verification. Exact corrected-head hosted checks remain required.

No original unfinished criterion is completed by this test correction.
Application execution, session-only questionnaire policies and every other
unchecked requirement remain active.
