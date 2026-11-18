# Windows preload URLs, CLI version admission and notice CI registration

Issue: <https://github.com/link-foundation/meta-sovereign/issues/56>. PR: <https://github.com/link-foundation/meta-sovereign/pull/57>.

## Preserved hosted failures

The cdbfeaf1 Checks run [43100397266](https://github.com/link-foundation/meta-sovereign/actions/runs/43100397266), created 2026-11-11 at 21:07:44 UTC, failed three Windows jobs. Raw Deno job 130791973175 lines 3421–3423 and 10253–10259 show the first delayed CLI version check exceeding its unchanged ten-second test budget. Its next ordinary-command check passed in 894 ms. Lines 10264–10347 identify the separate reconnect-fixture failure: Node interpreted an absolute Windows preload path as protocol `c:` and refused it with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. The Node and Bun jobs report the same preload error. The dependent pipeline failed because those tests failed.

The next actual commit, 2efd33cd, was pushed at 21:59:29 UTC. Its [Checks run 43107866221](https://github.com/link-foundation/meta-sovereign/actions/runs/43107866221) repeats the preload failure in all three Windows runtimes. Deno lines 3414–3415 now pass both output checks (4 s / 868 ms); Node lines 1563–1564 pass them too. This variation does not establish the earlier timeout's exact cause.

Two additional notice-unit mistakes have concrete evidence on this same SHA:

- Chromium job 130817278686 line 996 and WebKit job 130817278354 line 874 reject `question-notice-policy`: it is registered but has no corresponding package command.
- JavaScript CodeQL job 130817277935 line 7895 reports `js/bad-code-sanitization` in `notice-policy-mcp.mjs:144`. The separate [security workflow 43107866218](https://github.com/link-foundation/meta-sovereign/actions/runs/43107866218) reports the same finding at lines 7934–7936 of job 130815834786. Its pipeline reports `codeql: failure` at lines 200–202. JSON interpolation into generated JavaScript needs additional escaping, as described in the [CodeQL query documentation](https://codeql.github.com/codeql-query-help/javascript/js-bad-code-sanitization/).

Full job logs and SHA/timestamp metadata are retained in the evidence archive. No finding, registered scenario or deadline is suppressed.

The same run later exposes a separate WebKit watch-fixture failure in job 130817278611: lines 866–891 time out clicking a hidden child disclosure after the root summary was toggled. Both earlier scenarios in that group passed. Its raw log is preserved for immediate separate investigation; this unit does not claim to resolve it.

## Reproduction and correction

`python3 experiments/issue-56/windows-cli-before.py` temporarily loads the actual parent index, ordinary commands, preload fixture and package metadata, then restores them in `finally`. A real temporary directory containing a fragment marker and space reproduces the preload path distinction on Linux: the parent loses the fragment and fails both existing reconnect checks. The corrected fixture passes `pathToFileURL(preload).href`, retaining the real dropped-query failure, cleanup, silent default behavior and finite observation budget.

The actual parent version graph loads 627 application modules, including 297 provider modules. The shared finite load-hook probe records 986 ms and 110,700 KiB maximum RSS on this local run. All three version aliases now select a tiny version consumer through the existing argument/store/error runner. The same probe records eight modules, 25 ms and 51,580 KiB, with exact unchanged version output and exit codes. These observations demonstrate eliminated startup work; they do not prove the hosted Deno timeout's cause. Default-off `MS_LIFECYCLE_DEBUG=1` reports only consumer admission timings. Output checks enable it for future CI evidence, retain the ten-second deadline, and kill/drain an unsettled owned child in test cleanup.

The missing Chromium/WebKit package commands are restored. A general contract verifies that every registered browser check resolves to an existing direct Node entry; the question group contract also covers both notice scenarios. A shared MCP script serializer escapes angle brackets and JavaScript line separators after JSON encoding. Its regression verifies malicious-looking fixture text remains exact data, cannot terminate a script element and never runs as code. The before probe reproduces the parent's unescaped interpolation as well. Altogether six focused assertions fail before the corrections.

## Focused validation and limits

Local verification uses sequential, bounded checks without a source build or full suite:

- Nineteen Node checks cover CLI behavior/output, real reconnect cleanup, actual version/serve import graphs, browser registry/shards and script-data round trips.
- Seventeen Deno checks cover the same relevant behavior, with two Node-only load-hook checks explicitly ignored. Six Bun checks exercise the two Windows-affected output/cleanup files.
- The actual `RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome npm run test:e2e:question-notice-policy` entry executes the seven native Chromium cases and four production UI scenarios in 77 seconds. Earlier local invocations omitted the required browser opt-in or selected an uninstalled Playwright binary; both logs are preserved separately and do not count as validation. The installed-Chrome override avoids a browser download. Existing notice screenshots remain unchanged.
- Scoped lint, formatting and secret scanning pass. Duplication is 38,714 / 596,615 lines (6.49%), below the unchanged 6.5% threshold.

Hosted Windows, CodeQL and both browser lanes must confirm the new commit. Cross-chat/filter restoration, unread orchestration, full live/provider parity and every unchecked issue criterion remain unfinished; PR57 stays draft and unmerged.

Evidence: [ci-windows-cli.tar.gz](data/ci-windows-cli.tar.gz), with an adjacent SHA-256 manifest. Sources, before sources, six failing-before assertions, focused results, graph measurements and full hosted failures are preserved.
