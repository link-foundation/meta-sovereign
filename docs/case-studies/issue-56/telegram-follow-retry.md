# Telegram Follow retry boundaries

Work for [issue 56](https://github.com/link-foundation/meta-sovereign/issues/56)
in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
This corrects Telegram reads inside automatic Follow. FL08's wider configurable
standalone discovery/membership policy and lifecycle audit remain unfinished,
as do every other unchecked issue-wide criterion.

## Reproduction and cause

Configure automatic Follow with three read attempts, a 10 ms initial delay and
a 20 ms cap. Make Telegram's membership read fail twice with a typed timeout,
then return the current membership. Before this correction, the standalone
Telegram boundary flattened the first failure into `read-failed`; the parent
could not apply its configured timeout policy. Parsed SDK flood waits likewise
lost their structured provider refusal and duration.

Four regression cases fail against preceding commit `f82bba0c`: successful
timeout recovery, exact exhaustion, refusal preservation and standalone
sanitized failure details. Their complete 104-line log is preserved in the
evidence archive. No provider credentials or live account writes are used.

The SDK's high-level entity helpers may issue additional hidden requests,
retry internally or swallow a lookup failure. Follow now uses typed single-call
RPCs for fresh owner identity, username/numeric target resolution, membership,
preferences and dialog pagination. Every request disables SDK request retries
and flood sleeping without changing the shared client's settings. The local
session cache supplies access hashes; provider lookup failures propagate.

Automatic Follow passes its configured read policy into phase preparation and
the final prewrite checks. The issued membership/preference request retains its
existing single-call durable intent and receipt handling. A parsed flood wait
is a refusal, and an ambiguous write remains uncertain. Neither is retried.
Opt-in `MS_FOLLOW_DEBUG=1` records the request method and sanitized failure code;
it excludes raw provider messages, credentials and invitation URLs.

## Verification

The focused 66-check group covers eight new retry regressions, the complete
membership/preferences fixture, automatic rounds and lifecycle/persistence,
retry classification and existing CLI/default Lino route compatibility:

```sh
node --test --test-concurrency=1 js/tests/follow-telegram-retry.test.js js/tests/follow-telegram.test.js js/tests/follow-auto.test.js js/tests/follow-auto-lifecycle.test.js js/tests/follow-auto-persistence.test.js js/tests/follow-retry.test.js js/tests/live-follow.test.js js/tests/server-follow.test.js
```

The final prewrite regression injects timeouts after the durable membership
intent is stored, then confirms exactly one join, mute, archive and backlink.
Cancellation during backoff prevents another provider request. Numeric/basic
group/private-message lookup errors propagate without SDK entity helpers.
Installed SDK requests are resolved and serialized with explicit zero-retry
options. Existing queue-deadline and shutdown ownership regressions still pass.

Six additional CLI/text-binary Lino/UI compatibility checks pass. Scoped strict lint, formatting and secret scanning pass. The unchanged production UI is checked
with the existing standalone Telegram and automatic Follow Chromium flows;
screenshots for those workflows remain in their original case studies. No
visual assets or user-facing controls change in this correction.

## Current CI evidence

All five workflows for preceding `54d8ae4d` were inspected by exact SHA and
creation time. Its security failure and correction are documented in
[ci-54d8ae4d.md](ci-54d8ae4d.md). The corrected `f82bba0c` security run passes.
That head's link run `42780345216`, created at 08:08:46 UTC on 2026-11-10,
initially reports 25 GitHub 504 failures (raw log lines 443–481). Rerunning the
same SHA succeeds with zero errors (attempt-two lines 411–416). Both full logs
are retained; no pinned source link was removed or ignored. The preceding Checks run `42779144776` records the same corrected CodeQL
finding at lines 35177–35179 and a cancelled WebKit job at line 28456;
its aggregate reports both at lines 99694–99696. The last completed browser
scenario is successful, and no assertion failure appears at cancellation.
The newer branch run is consistent with concurrency supersession; cancellation
is not a passing matrix. Its complete 99,712-line log and job snapshot are
preserved. Remaining workflows and the new commit's exact-head matrix still
require review.

Raw logs, source hashes and run snapshots are in
[telegram-follow-retry.tar.gz](data/telegram-follow-retry.tar.gz), with a
[SHA-256 manifest](data/telegram-follow-retry.tar.sha256.json).
