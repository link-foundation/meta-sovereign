# Observe receive completion without animation frames

Published `c930cf39` Checks run [43673148877](https://github.com/link-foundation/meta-sovereign/actions/runs/43673148877) fails only WebKit shard 2 (job `132688300301`) and the aggregate status. The complete job log has successful native catch-up at line 1713, then `page.waitForFunction: Timeout 5000ms exceeded` at line 1719. The other four workflows and all other browser shards pass. All run metadata matches the published SHA and 2026-11-15 03:36:47 UTC creation time.

The five-second predicate in `checkReceiveIsolation` defaults to animation-frame polling. The receiver is a separate page, so its frame clock is not a persistence or RTC completion clock. A finite scheduling probe installs a frame gate before Playwright captures that clock, pauses only receiver frame callbacks, and delays only the fixture's completion flag by 250 ms after its actual owner write. Native signaling, RTC, API operations, browser storage and timers stay in use. With the exact published helper, both peers converge and `triggered`, `written`, `merged` and `replicated` are true, yet the predicate times out. Restoring the current helper is protected by `finally`.

The predicate now polls every 100 ms while retaining its five-second deadline and every owner/remote convergence assertion. Its failure reports bounded hook state without application records, SDP or ICE addresses. The mandatory existing sync group uses the same finite frame gate, so reverting to frame-based polling reproduces the regression in hosted coverage. The gate restores the fixture API and resumes frames before later mesh scenarios.

The original hosted run did not log hook state, so it cannot establish that its particular timeout had this scheduling cause. The ordinary local scenario also passes before the change. An initial frame probe without delayed completion passed because the predicate was already true; that log is preserved. The exact-helper probe with controlled initial incompletion establishes the independently reproducible fixture defect. The new diagnostic distinguishes any future missing hook or rejected write from scheduling.

Reproduce and verify with these focused commands:

```sh
python3 -B experiments/issue-56/sync-isolation-polling-parent.py
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node experiments/issue-56/sync-isolation-polling.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node js/tests/e2e-lino-sync.mjs
```

The exact-parent probe fails with successful native convergence; the corrected probe and the complete relevant WebKit sync group pass. The latter retains offline rediscovery, ordinary causal writes, absent-peer catch-up, receive isolation, three peers, connected reload, fresh bidirectional writes, deletion and survivor writes, with zero page exceptions. All owned contexts, browsers and servers close. Scoped lint, formatting, secrets and diff checks pass; the unchanged duplication gate passes. No full local suite or browser/runtime matrix was run, and no production UI or sync behavior changes.

The [checked evidence archive](data/ci-sync-isolation-polling.tar.gz) preserves full failed-job logs, exact-SHA workflow metadata, exact-parent helper bytes, finite probes and final sources. Fresh exact-head hosted checks remain required. Every unmet original criterion remains unfinished in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays draft and unmerged.
