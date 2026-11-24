# Windows private pause checkpoint timeout

Published `a493e1cf72f7f5cb482e9aaf8676cdb235488baa` failed the real private
Lino close/reopen regression in
[Windows Node shard 1/3](https://github.com/link-foundation/meta-sovereign/actions/runs/43874840625/job/133327682519).
Raw log line 1987 reports 5033 ms. Lines 3892–3895 identify its existing
five-second deadline; the suite recorded zero failed assertions, one cancelled
test and an exit code of one. The original execution contains no storage-phase
receipt, so it cannot establish whether opening, acknowledging, stopping or
reopening was delayed.

The single named regression passes locally in 150 ms with owned-reader close
tracing. This is Linux fixture evidence, not a Windows reproduction. The new
`MS_APPLICATION_LIMIT_DEBUG=1` fixture trace records only fixed phase names,
sequence numbers and elapsed durations. It captures the actual put/flush/close
calls and integration boundaries, with a finite 64-operation cap. Paths,
private records, provider content and exception text are excluded. It defaults
off and is enabled only in Windows Node CI.

The test still opens a real private Lino log, acknowledges the provider pause,
stops its service, closes and reopens the log and verifies the identical saved
pause. Its assertions, durable writes, five-second timeout, suite concurrency
and cleanup are preserved. This change is diagnostic; it is not a root-cause fix.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 --test-name-pattern='an acknowledged pause survives' js/tests/job-application-limit.test.js
MS_APPLICATION_LIMIT_DEBUG=1 node --max-old-space-size=384 --test --test-concurrency=1 --test-name-pattern='an acknowledged pause survives' js/tests/job-application-limit.test.js
```

Both focused invocations pass. The trace contains 28 completed operations,
including nine puts and ten flushes, followed by real reopening and cleanup.
Full platform suites remain assigned to CI. Published Windows traces must be
read before concluding what delayed the earlier job; a later passing run
cannot establish that cause by itself.

[Investigation plan](ci-lino-pause-plan.md),
[preserved evidence](data/ci-lino-pause.tar.gz) and
[hash manifest](data/ci-lino-pause.tar.sha256.json).
All 60 unchecked criteria remain required; this accepts no inventory row in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Published Windows trace

On `b61cf5fd`, [Windows Node shard 1/3](https://github.com/link-foundation/meta-sovereign/actions/runs/43879915890/job/133345481256)
passes the named regression in 88.994 ms (raw line 2046). Lines 1990–2045
contain all 56 events, with every one of the 28 operations completing. The
initial open takes 3.976 ms, entry 27.967 ms, acknowledgement 34.615 ms,
service Stop 0.360 ms, reopen 8.300 ms and the reopened pause read 0.583 ms.
The longest individual store flush takes 7.863 ms. Lines 3940–3944 report
2,348 tests, 2,345 passes, no failures and no cancellations; three tests skip.

These are observations of the later successful run with the unchanged deadline.
They show no stalled operation in that execution and cannot identify the
earlier timeout's cause. The original failure remains preserved separately;
no production storage change or deadline increase is justified by this receipt.

[Hosted log and job metadata](data/ci-lino-pause-hosted.tar.gz),
[hash manifest](data/ci-lino-pause-hosted.tar.sha256.json).
