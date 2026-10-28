# Validation on the user's machine

Run only specific tests relevant to the changes locally, with limited concurrency. Do not run the full test suite, stress tests, or full runtime/browser matrices locally. Push and review GitHub CI/CD for those checks. Keep the user's running application server separate from test fixtures.
