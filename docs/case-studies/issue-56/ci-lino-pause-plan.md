# Windows acknowledged-pause investigation

Keep every original issue requirement active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57). A successful
retry alone cannot prove the cause of an earlier timeout.

- [x] Bind the failure to published commit `a493e1cf`, Checks and release run
      `43874840625`, Windows Node shard 1/3 job `133327682519`. Preserve its
      full raw log and exact job metadata.
- [x] Read the actual failure: log line 1987 records the real Lino close/reopen
      test at 5033 ms. Lines 3892–3895 identify the existing five-second timeout;
      the suite reports zero failed assertions and one cancelled test. No
      storage phase is present in that failed execution.
- [x] Read the private-store integration, acknowledgement, Lino writer, flush,
      owned-reader close and service Stop code. Run only the named regression
      locally with concurrency one: it passes in 150 ms, including owned reader
      closure. This does not reproduce or explain Windows behavior.
- [x] Add bounded opt-in phase and store put/flush/close timing to the existing
      real integration test; enable only that trace in Windows Node CI. Preserve
      assertions, five-second deadline, durable writes and real file reopening.
- [ ] Run the focused test with and without tracing, verify the trace contains
      only fixed phase names and durations, and publish the diagnostic change.
- [ ] Read the published Windows result, then resolve any identified stalled
      operation with a reproducing regression. Keep the cause unfinished if
      the new run cannot establish it. Review all other current-commit checks.
