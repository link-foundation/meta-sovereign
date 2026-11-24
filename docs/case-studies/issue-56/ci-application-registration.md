# Native application browser registration

The exact `7d105671` hosted workflow failed in job
[133462719382](https://github.com/link-foundation/meta-sovereign/actions/runs/43913689572/job/133462719382).
Its raw log lines 538 and 642–685 identify the native scenario registration
contract. The new approval regression used a conditional scenario array which
the static registry contract could not enumerate. Its default array also had
five scenarios, exceeding the existing four-scenario bound.

Move the approval regression into the separately registered
`job-application-answers` check and restore the original four-scenario group.
The mandatory list explicitly includes the new regression. Both engines and
all four partitions retain every check once; timeouts and gates are unchanged.

Reproduce with
`node --test --test-concurrency=1 js/tests/ci-browser-shards.test.js`.
The actual parent has four passing checks and one failure. The correction has
five passes, including execution of the isolated partition runner and failure
propagation. Scoped ESLint and formatting checks pass. The approval browser
scenario itself is unchanged and retains its earlier three finite native
receipts. Run it directly with
`RUN_BROWSER_E2E=1 node js/tests/e2e-job-application-answers-browser.mjs`.

[Evidence archive](data/ci-application-registration.tar.gz) and its
[SHA-256 manifest](data/ci-application-registration.tar.sha256.json) preserve the
actual hosted failure, focused before/after checks and source bytes. Hosted
verification of the correction remains required. This CI correction accepts
no issue inventory row; PR57 remains draft.
