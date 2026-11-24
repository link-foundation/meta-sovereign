# Vacancy discovery CI investigation

- [x] Match the failed workflow timestamp and exact SHA to the published head.
- [x] Preserve failed WebKit shard and aggregate-job logs, including original
      30-second completion-wait error and all preceding scenario timings.
- [x] Run only the isolated native WebKit discovery case with existing debug
      events; preserve its unchanged successful 38-second overall receipt.
- [x] Reproduce the published test's aggregate-wait failure with four finite
      native reads and a bounded fixture delay; restore the exact helper afterward.
- [x] Assert acknowledged card progress within each unchanged locator deadline,
      then require terminal completion, exact full results, reload without replay,
      four languages and closed owned resources.
- [ ] Preserve focused native evidence and quality checks, commit the atomic
      correction, and verify the exact final published head in hosted CI.

Production discovery/navigation deadlines, readiness checks, polling and job
bounds stay in force. No issue criterion is accepted by changing a test alone.
Every unmet inventory row remains required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
