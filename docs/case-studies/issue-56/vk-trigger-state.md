# Durable live trigger admission and drained shutdown

Duplicate concurrent incoming updates on published parent
`2798951cb62454a0e9e400a75649fa492d7911d7` run the same automation four
times. The parent also records a schedule as completed before drafting succeeds.
The scheduler's synchronous Stop leaves admitted drafting active during the
server's final flush. These are shared runner defects identified during VK26.

The extracted scheduler serializes admission per store, including separate
scheduler instances using that store. Acknowledged records distinguish the
automation, provider and peer. They retain the latest provider timestamp and up
to 128 distinct IDs at that timestamp; older updates and duplicate IDs are held.
Saturation refuses new work instead of forgetting prior IDs. Failed drafting or
receipt acknowledgement leaves the previous state authoritative. The receipt
says `processed` and records the actual draft count; it claims no delivery.
Scheduled state advances only after the runner succeeds and its receipt persists.

Stop refuses new and waiting work, unsubscribes and drains admitted work through
acknowledgement. Server shutdown awaits this operation before its final flush.
Incoming and schedule triggers retain their existing draft-only behavior.

Reproduce the parent failure and the isolated missing-await mutation with
`python3 -B experiments/issue-56/vk-trigger-before.py`. The retained failures are
`4 !== 1` and `true !== false`. Twenty-six focused Node and twenty-six Deno
checks cover concurrent duplicates, peer/provider/automation boundaries,
equal-time and stale updates, failed drafting/flush rollback, causal text-store
close/reopen, saturation, real server shutdown, concurrent schedule ticks and
existing runner behavior. Initial server-fixture timing failed because an update
was created before server startup; the fixture now timestamps and writes through
the returned running store and releases its gate on test cancellation.

The checked [archive](data/vk-trigger.tar.gz) and
[manifest](data/vk-trigger.tar.sha256.json) retain source bytes, parent sources,
pinned runner/state references and finite logs. This internal change has no new
visual controls. Exact-head hosted verification is still required. The broader
[VK26 queue and interface checklist](vk-runner-plan.md) remains unfinished,
along with every other unchecked original criterion. No live provider operation
is claimed. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft and unmerged.
