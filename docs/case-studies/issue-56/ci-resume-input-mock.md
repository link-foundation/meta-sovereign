# Résumé diagnostic mock regression

At `2ece94b4bd51ea3555492abc457052bf79f327e8`, the main
[hosted workflow](https://github.com/link-foundation/meta-sovereign/actions/runs/44063257040)
fails in `resume-input-trace.test.js`. The Windows Node job log lines
3804–3810, Windows Deno lines 6153–6160 and Linux Bun lines 5670–5688
all identify `TypeError: page.on is not a function`. The diagnostic helper
now observes request events, but the old page mock only implements
`addInitScript`; its document mock also lacks `querySelectorAll`.

The unchanged single test reproduces locally. The mock now uses Node's
`EventEmitter` and supplies the empty résumé row list. Its existing assertions
remain. A second finite test verifies that only the two résumé API paths are
retained, request history stays within 32 records, response/failure phases are
recorded, query strings are omitted and request bodies are never read. Explicitly
disabled tracing installs no event listeners.

Both tests pass on Node, Bun and Deno. No production implementation, browser
assertion, timeout, engine, runtime partition or CI gate changes. This fixes the
portable test fixture; the earlier WebKit discovery timeout's cause remains
unconfirmed in [its separate report](ci-resume-cache-trace.md).

```sh
node --test --test-concurrency=1 js/tests/resume-input-trace.test.js
bun test js/tests/resume-input-trace.test.js
deno test --allow-env=CI_RESUME_INPUT_DEBUG js/tests/resume-input-trace.test.js
```

The [archive](data/ci-resume-input-mock.tar.gz) preserves exact failed logs,
source metadata, the parent fixture, focused results and corrected source.
Fresh hosted verification and all 40 original unchecked requirements remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
