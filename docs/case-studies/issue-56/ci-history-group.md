# Give conversation history its own mandatory browser budget

CI correction for [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57), R-Z32. All unchecked acceptance criteria remain required; the PR stays draft and unmerged.

The completed [parent Checks run 43065220252](https://github.com/link-foundation/meta-sovereign/actions/runs/43065220252), created at 2026-11-11 17:08:31 UTC for `ff7a9d711fcde7f556a9105350282aed6a731220`, exceeds the existing 180-second subprocess budget in both browser engines. Chromium raw job lines 2753–2767 show the native list and virtual scan passing in 6,177 and 75,428 ms, followed by history collection starting. The process is killed at 180,694 ms. WebKit lines 2568–2582 retain the same sequence: 6,529 and 80,409 ms before history, killed at 181,599 ms. These results demonstrate the combined group is too large for its budget; they do not establish a history assertion failure.

Move the unchanged sixteen-case conversation-history scenario to `question-history`. Keep list extraction and virtual scanning in `question-chat-lists`. Both groups remain mandatory in Chromium and WebKit, with the same 180-second subprocess and 35-minute job deadlines. No scenarios, provider guards, checks or engines are removed. The registration contract now rejects a scenario appearing in multiple bounded groups as well as an omitted group/script.

The contract fails against actual parent `4c58bbb1` because history has no independent group. It also fails against the intermediate registration with history left in both groups. Eighteen focused Node CI contracts pass after correction; both entry points pass syntax checks. The actual history implementation is byte-identical to the parent, whose [focused production-browser and independent MCP evidence](conversation-history.md) remains preserved. Full new-head group execution belongs to hosted CI; it is not repeated as another local browser matrix.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/history-group-before.py
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-contracts.test.js
node --check js/tests/e2e-question-history-browser.mjs
node --check js/tests/e2e-question-chat-lists-browser.mjs
```

Scoped lint, formatting, secret scanning and the unchanged duplication gate pass. The [archive](data/ci-history-group.tar.gz) and checksummed manifest retain both failing registrations, passing contracts, unchanged scenario snapshots and complete failed browser job logs. Recollect with [collect-history-group.py](../../../experiments/issue-56/collect-history-group.py).

Exact-head hosted verification remains required. The same parent Chromium run also fails a hidden Learn from conversations summary (2665–2686); its root Questions disclosure is closed in the downloaded, validated PNG. WebKit's later cancellation at 17:38:01 UTC follows the next push at 17:35:05. Neither is fixed by group registration. Those investigations, hosted startup confirmation, complete background text/unread orchestration, live provider checks and every unchecked issue requirement remain unfinished.
