# macOS checkout timeout on fccb2648

Checks/release run [42741188548](https://github.com/link-foundation/meta-sovereign/actions/runs/42741188548)
was created on 2026-11-10 at 02:12:57 UTC for
`fccb26486949925287db961dae76faa44c07d13b`. All selected browser jobs passed;
the aggregate failed because Node macOS shard 2/2 was cancelled during checkout.
No test in that job ran.

The complete downloaded log is `ci-logs/checks-42741188548.log` (93,014 lines).
The relevant bounded excerpt is preserved in the text-receipt evidence archive:

- Lines 80907–80908: full-history checkout fetch began at 02:38:48 UTC.
- Lines 80909–80914: at 02:47:56 UTC, curl 56 reported a receive timeout,
  9,550 missing response bytes, unexpected disconnect, early EOF and exit 128.
- Lines 80915–80917: checkout retried, then was cancelled at 02:48:28 UTC,
  the job's existing ten-minute deadline.
- Lines 92996–92998: the pipeline gate correctly failed with `test: cancelled`.

This is a failed repository download before dependency installation or test
execution. No deadline increase or test bypass is justified by this evidence.
The next pushed commit has its own required matrix; this stale cancelled run
does not establish its result. The current-head checks must still pass before
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) can be finalized.
