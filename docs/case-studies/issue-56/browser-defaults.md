# Headed-browser defaults (R-AA2)

The issue requires visible windows by default. Before this change, `cv/browser.js`, the CV facade, the CLI, HTTP CV routes and browser-based messaging each selected headless mode independently. Changing only the factory would have left four callers overriding the result.

The factory and callers now default to `false`. CV CLI users can explicitly select `--headless`; `--headless=false` and the existing `--headed` flag retain visible windows. API/library callers can select `headless: true`. Existing persistent profiles, delivery safeguards and injected sessions are preserved.

`js/tests/browser-mode.test.js` reproduces the launch-option failure through the factory, facade, CLI and API with injected sessions. All four cases failed before the fix and passed afterward. No browser, profile, account or provider connection was used. The broader focused check also passed all 68 tests across the new test and existing CV CLI, CV API, CV sync and browser-sender tests.

Commands:

```sh
node --test --test-concurrency=1 --test-timeout=10000 js/tests/browser-mode.test.js
node --test --test-concurrency=1 --test-timeout=15000 js/tests/browser-mode.test.js js/tests/cv-cli.test.js js/tests/cv-server.test.js js/tests/cv-sync.test.js js/tests/browser-sender.test.js
```

The saved `evidence/local/browser-*.txt` files contain the before/after results, focused verification and lint/format output. This step changes launch behavior; it does not change the rendered chat UI. Persistent per-case/per-slot configuration is still required before R-AA2 is complete.
