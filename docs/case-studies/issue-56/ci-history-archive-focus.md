# Full Chromium for inactive archive ownership

Exact `bea3183ee94d04d0cb51b3961b0db08d84ef01c7` Checks run
[43793268260](https://github.com/link-foundation/meta-sovereign/actions/runs/43793268260),
created `2026-11-16T02:37:08Z`, fails Chromium shard 1 job `133057652758`.
Preserved job lines 1091–1110 report browser-background-owner-active instead of
the expected question-history-save-failed. The earlier ordinary history cases
pass at line 1084. The intended rejected checkpoint was never reached.

The new archive fixture uses inactive unread navigation in the question-history
group. That entry omitted the existing nativeFocus option, so hosted launch used
Headless Shell. The separately documented [native focus probe](ci-native-focus.md)
establishes that this shell reports both tabs focused even after focus emulation
is disabled. The production owner guard correctly refuses this state. Earlier
local archive verification used installed full Chrome, explaining that difference.

The question-history entry now selects the same full Chromium launch as the
existing inactive-history group. Both remain mandatory and the focused launch
contract verifies both entries. Other groups, WebKit and an owner's explicit
executable override retain their launch behavior. No production focus guard,
assertion or deadline changes.

The expanded contract fails on the actual published entry, then all 26 focused
launch/workflow/shard checks pass. The installed full-Chrome archive scenario
verifies three cases: acknowledged windows, twelve messages surviving physical
Lino close/reopen, and the intended rejected checkpoint followed by complete
owned-view restoration. All owned stores and browser resources close.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/ci-native-focus.test.js js/tests/ci-contracts.test.js js/tests/ci-browser-shards.test.js
node --max-old-space-size=384 experiments/issue-56/browser-history-archive-browser.mjs
```

The [archive](data/ci-history-archive-focus.tar.gz) and
[byte manifest](data/ci-history-archive-focus.tar.sha256.json) preserve the raw
failed job, exact SHA/timestamps, parent entry and before/after verification.
The independent WebKit disclosure failure and all 60 unchecked issue criteria
remain unfinished in [PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
The new head still requires its complete hosted matrix.
