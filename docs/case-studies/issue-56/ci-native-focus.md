# Run native focus checks in full Chromium

The [Checks run for b73f3433](https://github.com/link-foundation/meta-sovereign/actions/runs/43091914519), created at 2026-11-11 19:57:05 UTC, fails Chromium shard 2 in the first inactive-history lease admission. Job `130772386582`, preserved log lines 1402–1421, reports `browser-background-owner-active`. All preceding groups in that shard pass. This is an actual focus refusal, before any history traversal.

Two empty local tabs reproduce the cause. Playwright's bundled Chrome Headless Shell 158 reports both tabs focused, including after disabling focus emulation and bringing the other tab forward. Installed full Chrome 155 reports the original tab focused, then unfocused, then focused again. The actual parent scenario helper in the bundled shell reproduces the hosted admission failure. The production ownership check correctly refuses that unavailable background state.

The inactive-history group now explicitly uses Playwright's full Chromium executable, already installed by the existing CI browser installation. Other groups, WebKit and an explicit owner executable override keep their existing launch behavior. Production guards, the eight scenarios and all deadlines remain unchanged.

Verification includes an actual-parent failing launch contract, 22 focused Node checks, one Deno launch contract, strict changed-code lint and all eight native-history cases in installed full Chrome. Those cases cover focused refusal, restoration of twelve historical messages and the draft/selection/anchor, owner return, outer and child ownership, cancellation, delayed scroll and drained close. The shell/full-browser probes and the real scenario always close their isolated browsers. No live account or provider traffic is involved.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/ci-native-focus.test.js js/tests/ci-contracts.test.js js/tests/ci-browser-shards.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check js/tests/ci-native-focus.test.js
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome NODE_OPTIONS=--max-old-space-size=384 node js/tests/e2e-question-inactive-history-browser.mjs
```

The [evidence archive](data/ci-native-focus.tar.gz) retains the actual parent helper and failing results, shell/full-browser observations, focused passing checks and the hosted raw failure. Recollect with [collect-ci-native-focus.py](../../../experiments/issue-56/collect-ci-native-focus.py). Exact-head hosted full Chromium 158 verification, recurring Windows release preparation, the original intermittent macOS clink assertion and every unchecked product requirement remain open in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
