# VK fixture handling of native WebKit diagnostics

Exact published head `53a8479253b7a75b2f39cfa6d06ac816f6f7be93` fails [Checks run 43668793618](https://github.com/link-foundation/meta-sovereign/actions/runs/43668793618). All four companion workflows pass. The sole failed test job is WebKit shard 2/4, job `132674817667`; its complete 1,859-line log is preserved alongside the complete workflow log and exact-head metadata.

Job log lines 1342–1352 show the gratitude fixture's final empty-error assertion failing on `/127.0.0.1:49291/api/status?probe=1 due to access control checks.` at helper line 80. This is the native WebKit diagnostic for a handled same-origin discovery request during document replacement. The shared discovery code catches the fetch rejection; the repository already has a narrowly scoped fixture policy for this engine-specific diagnostic. The VK helper instead recorded every `error.message`, losing the native name and bypassing that policy.

Use the existing `watchFixturePages` policy with the actual browser engine and each fixture's private origin in greeting, gratitude and identity scenarios. Genuine unhandled exceptions, ordinary exceptions containing similar text, other origins and other engines remain failures. No production behavior, deadline, assertion or engine coverage changes.

## Reproduction and verification

```sh
python3 -B experiments/issue-56/ci-vk-diagnostics-parent.py
node --test --test-concurrency=1 js/tests/vk-automation-browser.test.js js/tests/e2e-page-errors.test.js
node js/scripts/build-web.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node experiments/issue-56/vk-identity-compatibility-browser.mjs
```

The finite replay reproduces one failing assertion using the actual published parent helper and captured native Error name/message split. The corrected VK replay and existing policy checks pass 13 cases. One focused native WebKit gratitude scenario verifies preview, edited text, save/reload, phone fit, zero sends and owned resource closure. The first local attempt used the unbuilt checked-in browser bundle and timed out waiting for the absent gratitude controls; that log is retained. The corrected run builds the fixture bundle first. A local naturally occurring recurrence of the hosted diagnostic is not claimed.

Scoped lint, formatting, secrets, diff and the unchanged duplication threshold pass. [Checked evidence](data/ci-vk-diagnostics.tar.gz) and its [SHA-256 manifest](data/ci-vk-diagnostics.tar.sha256.json) preserve actual-parent bytes, complete hosted logs, the replay and final focused checks. VK02 and VK03 await corrected-head hosted checks. Every original unchecked criterion remains active; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft and unmerged.
