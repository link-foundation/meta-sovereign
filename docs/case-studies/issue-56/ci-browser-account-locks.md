# Bun account persistence fixture and Web Locks

Draft: <https://github.com/link-foundation/meta-sovereign/pull/57>.

Checks run [43481124739](https://github.com/link-foundation/meta-sovereign/actions/runs/43481124739), created at 2026-11-13 18:17:06 UTC for `8b1c19bad88061055a4c8657f771c947bcdcdd46`, fails the extra Telegram account browser-persistence test on Linux Bun job `132079487843` and Windows Bun job `132079488128`. The complete raw logs are preserved. Linux lines 660–684 and Windows lines 8686–8703 show `STORE_COORDINATION_UNAVAILABLE`; their final summaries contain one failure. Other jobs remain unfinished at collection.

The test installs a fake `localStorage` without supplying the other required browser capability, Web Locks. Bun does not expose that browser API. The new snapshot protection correctly refuses this uncoordinated whole-snapshot write. The account-key assertion is never reached. This is a fixture capability mismatch, rather than evidence that the production conflict protection should allow unsafe writes.

The fixture now supplies the existing finite `snapshotLocks()` helper beside its fake storage and restores both original global descriptors in `finally`. The production safeguard and all account-isolation assertions remain unchanged. Existing browser-storage tests separately verify refusal when lock coordination is unavailable, and mandatory native browser checks exercise actual lock/storage behavior.

Run `bun test --test-name-pattern 'an extra account keeps its own copy' js/tests/telegram-extra-accounts.test.js`. On the exact parent, this one selected case fails with the hosted error. With the fixture correction it passes under Bun 1.4.4 and Node, with zero failures. The other fourteen cases are filtered out in Bun. Changed-file ESLint also passes. No full local suite, browser matrix, source bundle rebuild or package installation is needed for this test-only correction.

The [checksummed evidence archive](data/browser-account-locks.tar.gz) retains both complete failed hosted job logs, exact-parent and corrected test sources, focused before/after output and CI metadata. The [manifest](data/browser-account-locks.tar.sha256.json) verifies every archived byte. Exact corrected-head hosted checks remain required. Native synchronization, automatic editable-tab merging and the other unchecked issue requirements remain unfinished; the PR stays draft and unmerged.
