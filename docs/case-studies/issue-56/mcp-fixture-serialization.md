# MCP fixture serialization

The [JavaScript CodeQL job](https://github.com/link-foundation/meta-sovereign/actions/runs/44390156219/job/135105297121) for published `aa095a98` still fails. Its complete job log lines 12471–12474 identify `js/bad-code-sanitization` in the search-route generator and its regression test. The SARIF locations are line 89 of `application-search-route-mcp-runner.mjs` and line 64 of `mcp-inspection-code.test.js`. The preceding [trusted-source correction](ci-generators.md) preserves trailing semicolons and comments, but does not resolve these fixture-data findings; its local compilation result was never a hosted security pass.

The remaining construction inserts `JSON.stringify` output into generated JavaScript. That output can retain HTML script terminators and Unicode line separators. [CodeQL's query documentation](https://codeql.github.com/codeql-query-help/javascript/js-bad-code-sanitization/) requires additional escaping when JSON is inserted into JavaScript. Source review also found that the existing generic inspection helper emitted object literals: a JSON key named `__proto__` consequently changed the object's prototype rather than remaining an own data property.

The shared fixture serializer now emits an escaped, quoted JSON document and parses it as data. It preserves JSON property semantics and the existing absent-fixture behavior. Application inspection work remains trusted repository function source, including its optional terminator and final comment; fixture data arrives as a separate fourth argument. The search-route, collection, preview and salary-batch generators use that argument, and shared translated labels and salary fixtures use the same serializer. No application behavior, CodeQL rule, audited exception or deadline changes.

Nine focused checks cover script delimiters, quotes, backslashes, Unicode separators, special property names, absent fixtures, all three trusted-source terminators and existing supplied callbacks. The exact published parent fails five and passes four controls; corrected source passes all nine. A separate finite probe runs the three actual log-backed generators with deliberately adversarial synthetic metadata. All three parent outputs retain script-sensitive characters; all three corrected outputs escape them and compile. The probe removes its temporary directories in `finally`, opens no browser and contacts no provider. Existing context and salary work files and the actual search-route output also compile.

```sh
node --test --test-concurrency=1 experiments/issue-56/mcp-fixture-parent.mjs
MCP_FIXTURE_REVISION=aa095a98 node experiments/issue-56/mcp-fixture-generators.mjs
node --test --test-concurrency=1 js/tests/mcp-inspection-code.test.js
node experiments/issue-56/mcp-fixture-generators.mjs
node experiments/issue-56/ci-generators-syntax.mjs
```

The complete failed logs, SARIF, exact parent modules, corrected source and focused verification are preserved in the hashed `mcp-fixture-serialization` evidence archive. Hosted CodeQL and the complete resulting commit's CI remain required. No criterion is promoted: 88/118 are verified and all thirty unfinished criteria remain required in [PR57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays draft and unmerged.
