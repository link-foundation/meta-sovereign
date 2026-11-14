# Recover shared unread passes in browser fixtures

The provider-wide saved unread ID added by the reply-visibility unit is deliberately shared by Questions, Chat and Operator. Entering another surface locks new-pass settings until its saved pass is explicitly recovered. The two older native UI fixtures only recovered on Operator. On Chat they attempted to fill the disabled chat limit, so Chromium timed out after 30 seconds.

## Published failure and reproduction

Checks run [43146149020](https://github.com/link-foundation/meta-sovereign/actions/runs/43146149020), created 2026-11-12 03:08:19 UTC for ec871d26811be18b42ff6de892da484f10d8cdca, fails Chromium shards 2 and 4. The complete log has 127,753 lines. Lines 37060–37087 show the notice fixture filling disabled value 20; lines 39990–40019 show the finite unread fixture doing the same. Every runtime/OS test and WebKit browser shard in that run passes. The full log is already preserved in `data/unread-polling.tar.gz`; the exact numbered error excerpts are retained with this unit.

Against the actual 6816d158 fixtures, run:

```sh
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome \
  NODE_OPTIONS=--max-old-space-size=384 \
  node experiments/issue-56/ci-unread-recovery-browser.mjs --before
```

The first three finite-review scenarios pass, then Chat times out filling the disabled limit. The captured failure image and raw log are retained. This is a fixture sequencing correction; the product's recovery guard is required behavior.

## Correction and verification

Both shared surfaces now recover before configuring another pass. A shared assertion first verifies that a saved ID blocks starting, then verifies that recovery changes neither native visits nor sends. Existing native delivery, draft restoration, read-only defaults, replay prevention and phone viewport assertions remain intact. No production behavior, test deadline or CI matrix is changed.

Run the same command without `--before` to execute the five finite-review and four notice-policy scenarios sequentially. All nine native Chromium scenarios pass with zero page errors (75 seconds for finite review; 116 seconds for notices). Final browser results, scoped gates, actual-parent fixture snapshots and screenshot hashes are archived in `data/ci-unread-recovery.tar.gz` and its manifest. Current-commit hosted CI remains required. This finite correction does not complete any remaining issue-56 criterion; PR 57 stays draft and unmerged.
