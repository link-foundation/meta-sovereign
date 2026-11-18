# Release notes and trusted inspection source

Two mandatory jobs failed on published `37bbae0d`; their timestamps and source match the latest pushed commit. Both failures are retained rather than dismissed as stale checks.

The [changeset job](https://github.com/link-foundation/meta-sovereign/actions/runs/44386603602/job/135093422826) reports three added release notes at log line 476 and rejects them at lines 478–484. The repository requires one added changeset per PR. The search-route, automatic-status and later birthday correction summaries are now combined into the existing minor release entry. All summaries and forward commit history are retained; the validator and release trigger remain unchanged.

The [security run](https://github.com/link-foundation/meta-sovereign/actions/runs/44386603581) reports `js/bad-code-sanitization` in the search-route MCP generator at combined log lines 19360–19362. The shared generator removed one trailing semicolon from a string containing trusted repository function source and serialized fixture data. It now assigns that source directly as a function expression, preserving its optional terminator and final comment without rewriting code. Fixture values remain serialized data. No CodeQL rule, exception or security gate changes.

The focused regression executes generated source in an isolated VM. It checks ordinary and terminated functions, a trailing comment, exact punctuation/backslash/Unicode fixture round trips and both supplied trusted callbacks. The actual parent passes five checks and fails the final-comment case; corrected source passes all six. Existing repository work files and the current search-route generator also compile without opening browsers or contacting providers. Hosted CodeQL remains required; a local syntax check is not a CodeQL pass.

```sh
node --test --test-concurrency=1 experiments/issue-56/ci-generators-parent.mjs
node --test --test-concurrency=1 js/tests/mcp-inspection-code.test.js
```

The unchanged changeset validator reproduces the extra-entry refusal before consolidation and accepts the committed consolidated tree afterward. Its hosted job passes on `aa095a98`, but CodeQL still identifies two fixture-data findings; see the [subsequent serialization correction](mcp-fixture-serialization.md). Logs, exact source, the original SARIF finding and validation evidence are preserved by `collect-ci-generators.py`. No issue criterion is promoted; PR57 remains draft and unmerged with 88 verified and 30 unfinished criteria.
