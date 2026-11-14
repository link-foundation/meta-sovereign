# Keep the rolling CLI host independent of provider commands

Implementation and investigation evidence for [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57), R-Z32. Every unchecked issue requirement remains required; the PR stays draft and unmerged.

## Observed failure and reproduction

The actual [macOS Node shard failure](https://github.com/link-foundation/meta-sovereign/actions/runs/43062262248/job/130669939552) at `1a35532cb2c87593cb887ebaec0e4e45f221d72b` exceeds its unchanged initial-readiness budget after 10,001 ms. Raw job lines 2063–2077 show 4,198 ms spent importing CLI modules, followed by 3,666 ms of release preparation; lines 2874–2887 retain the missing control socket. The complete log is already preserved in the [text-reply evidence](text-reply.md).

The CLI's static imports load every command, provider and the full in-process server before selecting `serve`. The rolling host then stages a release whose worker imports its own server graph. This duplicates unrelated module work in the host before worker startup. A finite invalid `serve` invocation on actual parent `96cd02273937d79cf163461c4c4a6acc76620f15` loads 823 application modules, including 310 provider modules, before reporting the invalid recovery format. The new admission regression fails on that parent.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/cli-imports-before.py
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/cli-startup-imports.test.js
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/cli-serve-imports.mjs
```

The before script temporarily restores the actual parent's two affected existing modules and restores working files in `finally`. The load-hook probe observes Node's real graph. Its invalid option prevents worker creation, provider access and source builds. The hook-specific test runs on Node; existing shared CLI and rolling-host behavior remains mandatory on Bun and Deno.

## Change and compatibility

The public CLI entry selects `serve` before importing ordinary commands. The extracted serve implementation retains rolling startup/reuse/upgrade, TLS preparation, logs, signals, browser opening and the programmatic in-process branch. Only that in-process branch imports the full server. Ordinary commands retain their implementations and aliases in a deferred module. All selected commands use one shared argument, default-store and handled-error runner; the existing schema-error export remains available.

`MS_LIFECYCLE_DEBUG=1` adds the selected serve module's import duration to existing phase traces. It is off by default and emits no store path, source content or credentials. Readiness still requires an actual worker and durable control metadata. No readiness, test, subprocess or job deadline increases.

The corrected finite probe loads 37 application modules and no provider modules. Single local observations change from 1,395 to 408 ms and from 129,168 to 80,196 KiB maximum RSS for the probe process. These observations are neither a benchmark nor proof of macOS timing. The preserved collector compares the moved ordinary command implementations/help/aliases and serve implementation against actual parent sources.

## Focused validation and remaining CI work

Fourteen distinct focused Node checks pass: import admission, CLI parsing/import/export/source/help/version, output draining, bounded readiness, schema status/dry-run/migration/refusal and one isolated production startup/repeated-serve/prepared-upgrade case. The final import check also passes with its finite child deadline. Initial readiness in the real CLI check is 3,930 ms: entry imports 15 ms, serve imports 271 ms, release preparation 2,304 ms, worker readiness 3,554 ms and control readiness 3,581 ms after staging began. The full startup/reuse/upgrade case takes 10.4 seconds and cleans its temporary store/processes.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/cli-startup-imports.test.js js/tests/cli.test.js js/tests/cli-output.test.js js/tests/rolling-cli-readiness.test.js
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern='CLI:' js/tests/migrations-surface.test.js
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/rolling-startup-profile.mjs
```

Scoped lint, formatting, secret scanning and the unchanged duplication gate pass. No full local runtime/build/browser matrix runs. The [archive](data/ci-cli-imports.tar.gz) and manifest retain source snapshots, the actual-parent failure, both graph observations and focused/raw CI logs. Recollect with [collect-cli-imports.py](../../../experiments/issue-56/collect-cli-imports.py).

Hosted verification of this correction remains required. The preceding `ff7a9d71` [Checks run 43065220252](https://github.com/link-foundation/meta-sovereign/actions/runs/43065220252) passes every runtime/static/native job but fails Chromium's Questions fixture: lines 2665–2686 show a hidden Learn from conversations summary after the root disclosure closes. Its combined chat-list/history group also exceeds 180 seconds in Chromium (2753–2767) and WebKit (2568–2582): completed list/scan scenarios already consume about 82/87 seconds before history begins. WebKit is later cancelled at 17:38:01 UTC after the text-unit push at 17:35:05. These are separate open investigations, not corrected by deferring CLI imports. Full raw logs and exact SHA/time metadata are preserved. Background text decisions, inactive owner restoration, unread orchestration and every other unchecked acceptance criterion remain unfinished.
