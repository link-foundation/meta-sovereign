# Optional model API during Automation rendering

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) preserves Automation rendering when no API was passed. The optional model settings block now checks that the API exists before checking its model capability. Existing rendering with an API retains the same controls.

Hosted Checks run [42917035254](https://github.com/link-foundation/meta-sovereign/actions/runs/42917035254), created at 2026-11-10T22:42:38Z for `eea31cdbfa698bced1248a5df17b7045099d401d`, fails seven existing screen tests in each affected runtime job. In the complete Ubuntu Node job log `resume-profile-parent-job-130187500074.log`, lines 5679–5682 identify the first failure and `question-controls.js:593`: `Cannot read properties of undefined (reading 'answerModel')`. The other six failures begin at lines 5693, 5707, 5721, 5735, 5749 and 5763. Deno, Bun and other OS jobs point to the same dereference.

The API is intentionally absent in these static Automation fixtures. The new optional model block introduced an unconditional property access; unrelated screen capabilities were not at fault. Running only `automations-view.test.js` before the fix reproduces three failures; the remaining four hosted cases are in `autopilot-views.test.js`. All 16 tests across both files pass in Node and Deno after the one-line guard. No assertion or capability contract was weakened.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 \
  js/tests/automations-view.test.js js/tests/autopilot-views.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check \
  js/tests/automations-view.test.js js/tests/autopilot-views.test.js
```

Strict changed-code lint, scoped formatting and the production web bundle pass. The [archive](data/ci-optional-model-render.tar.gz) and [manifest](data/ci-optional-model-render.tar.sha256.json) preserve the exact run metadata, nine complete runtime job logs, source and focused before/after receipts. Complete matrices remain on hosted CI. The same run's separate Chromium model-settings reload failure and WebKit question-edit/navigation failures remain under investigation; this guard does not claim to resolve them. Every unchecked issue criterion remains required and PR 57 stays draft and unmerged.
