# HH browser capability contract in hosted runtime tests

Issue [56](https://github.com/link-foundation/meta-sovereign/issues/56), [PR57](https://github.com/link-foundation/meta-sovereign/pull/57).

Hosted run [42986547260](https://github.com/link-foundation/meta-sovereign/actions/runs/42986547260), created 2026-11-11 08:22:41 UTC for `3538f08a1729f1d7eb0f6bc3fa9fa7e3a53ef8d3`, exposed an outdated capability contract in `message-actions.test.js:43`. The assertion required ordinary text sending and general message actions from every browser adapter. The newly registered HH adapter deliberately provides native choices and guarded prefill without those unsupported operations.

Nine completed runtime jobs fail at that same assertion. Preserved raw log locations include Node Ubuntu line 5921, Bun Ubuntu line 6255, Deno Ubuntu line 7654, Deno Windows line 9863, Node macOS shard 3 line 2800, Deno macOS line 9770, Bun macOS line 3501, Node Windows line 7332 and Bun Windows line 3810. Other log messages containing “failed” are successful negative-path tests, not additional failures.

The contract now explicitly checks HH native choices and verifies that ordinary send and general actions remain absent. Every previously registered full messenger keeps its existing capability assertions. Production capabilities are unchanged by this correction. The existing HH contracts still prove that unsupported text/typing operations refuse before launching a browser.

Verification: `node --test --test-concurrency=1 js/tests/message-actions.test.js js/tests/hh-web-ui.test.js`: **36 passed**, with Node memory bounded to 384 MiB. The original hosted logs reproduce the failing assertion before this test correction. Full runtime/browser matrices remain hosted; passing focused checks do not establish issue completion.

[Evidence archive](data/hh-capability-contract.tar.gz) and [SHA-256 manifest](data/hh-capability-contract.tar.sha256.json) preserve all nine raw logs, job/timestamp/SHA metadata, the prior test and the corrected contract. QA14 and all other unchecked issue criteria remain unfinished. PR57 remains draft and unmerged.
