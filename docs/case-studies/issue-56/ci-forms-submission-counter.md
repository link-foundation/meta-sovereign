# Submission counters in shared form browser checks

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) preserves the owner-submission learning check and verifies that later capacity and model scenarios add no submissions.

The Chromium job in [run 42904657245](https://github.com/link-foundation/meta-sovereign/actions/runs/42904657245), for capacity commit `60eb49c5b60b7626b6c1c45c949ac260774ca86a`, completed with a failure at 21:58:31 UTC on 10 November 2026. Its complete job log reports `assertion failed: browser cleanup without submissions` at line 2414. The preceding saved-PDF receipt at line 2413 confirms its own zero-submission cleanup. The four auxiliary workflows pass; that does not resolve the main browser failure.

The shared fixture counts every submission during the reader program. Its learning scenario intentionally sends one owner submission and verifies the resulting learned answer. The later capacity scenario incorrectly compared the lifetime count with zero. The new model scenario contained the same assumption. Both pass alone but fail after learning; this is test-state coupling, with no evidence of a product-initiated submission.

Capacity and model checks now retain the initial submission count and require it to remain unchanged through actual field readback and browser cleanup. Their receipts report the per-scenario delta. The shared counter is never reset. The new focused `FORMS_POST_LEARNING_ONLY=1` selection runs learning, capacity and model in the production order and finally requires exactly one lifetime submission and every owned browser closed. The normal CI reader sequence retains all three scenarios.

Reproduce the old assertion with the current focused selector and the two helpers from model commit `9e88993f1259cf920bf3c14dab4c48bcef62dbc8`. The retained before log fails at the capacity assertion. The same focused production Chromium command passes after the correction, including one model request, a real applied receipt, owner-input preservation, clarification and both zero-delta submission receipts:

```sh
RUN_BROWSER_E2E=1 FORMS_POST_LEARNING_ONLY=1 \
E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome \
NODE_OPTIONS=--max-old-space-size=384 \
node js/tests/e2e-forms-reader-browser.mjs
```

Strict lint and formatting pass for the three changed browser-test files. Full engine/runtime matrices remain on hosted CI and must pass for the subsequent commit. Complete job logs, focused before/after output, changed tests and run metadata are retained in the [verified evidence archive](data/ci-forms-submission-counter.tar.gz) and [manifest](data/ci-forms-submission-counter.tar.sha256.json). Issue-wide requirements remain unfinished; PR 57 stays draft and unmerged.
