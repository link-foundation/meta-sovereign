# Reuse the existing WebKit network diagnostic policy

Checks run [43021212329](https://github.com/link-foundation/meta-sovereign/actions/runs/43021212329), created 2026-11-11 at 12:32:26 UTC for `e172fd11a6f8dea07b8528051374e498871b21ab`, fails only the WebKit browser lane and its dependent pipeline gate. All five watch behaviors pass at full job-log lines 2514–2518. The final assertion at lines 2519–2546 rejects `/127.0.0.1:49911/api/status?probe=1 due to access control checks.` The profile previews and the newly separated Questions groups pass in this run. Their earlier independent failures remain investigations; a passing later run does not explain them.

WebKit emits this native diagnostic during navigation even when the application handles the fetch rejection. The shared browser harness already distinguishes its native `Error.name` from an ordinary application exception, checks the actual engine and requires the fixture's exact origin. The three independently hosted question-control fixtures instead collected only `error.message`, discarding that distinction. This made a handled discovery cancellation fail the watcher after its behavior assertions passed.

The controls, completed-summary and watcher fixtures now use `watchChatPages`, including its existing popup/dialog handling and opt-in trace. No application CORS rule, browser assertion, scenario or deadline changes. Genuine exceptions, unhandled rejections, another origin and another engine still fail under the existing policy tests.

`experiments/issue-56/watch-page-errors.mjs` replays the captured native name/message split into the actual production watch page. Chromium supplies the finite local fixture; the policy is explicitly given WebKit's engine name. This is a deterministic diagnostic replay, not a claim of running native WebKit. Before the correction all five behaviors pass and the same final assertion fails. Afterward the replay must occur exactly once, the policy trace must record it and the same five behaviors must pass. Eleven `e2e-page-errors.test.js` checks cover the diagnostic boundaries and standalone fixture adapter in Node and Deno. The hosted matrix retains real WebKit coverage.

```sh
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/watch-page-errors.mjs
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=20000 js/tests/e2e-page-errors.test.js
```

The [evidence archive](data/ci-watch-page-errors.tar.gz) and [manifest](data/ci-watch-page-errors.tar.sha256.json) preserve the full hosted job log, exact SHA/timestamps, actual parent fixture, deterministic replay and focused checks. New-head hosted CI, notice history learning, full unread orchestration and every unchecked issue requirement remain required. [PR57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged.

Integration review separately caught the initial notice scenario registration passing a standalone Browser to a helper requiring a page/store. Its six existing cases now run in the shared Questions fixture. One contract fails against the actual preceding registration; all eighteen CI contracts pass in Node and Deno after correction. The archive retains both entry points before/after and the routing logs. This does not change a browser deadline or remove coverage.
