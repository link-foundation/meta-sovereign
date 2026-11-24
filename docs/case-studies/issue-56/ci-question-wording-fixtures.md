# Independent question wording fixtures

The [83c5b1f7 Chromium job](https://github.com/link-foundation/meta-sovereign/actions/runs/43970589277/job/133664238751)
fails at log lines 1188–1194 waiting for one observed answer turn. Its preceding
equivalent-wording fixture saves five observations for the same question used by
the timing fixture. The planner correctly combines those observations with the
timing fixture's one observation. Independent scenario expectations therefore
cannot share these saved rules.

The existing three-scenario sequence now snapshots its isolated fixture store's
answer rules, clears them for each scenario and restores the original rules in
`finally`. Each scenario still verifies its original counts, approval, raw saved
answers, refused-save recovery and compact layout. The sequence additionally
asserts restoration after every scenario. Production planning and all timeouts
are unchanged. This is also the default mandatory browser-group path.

## Focused reproduction and verification

```sh
RUN_BROWSER_E2E=1 E2E_BROWSER=chromium E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome QUESTION_WORDING_SEQUENCE_ONLY=1 node --max-old-space-size=384 js/tests/e2e-questions-browser.mjs
```

The finite three-scenario installed-Chrome reproduction fails at the same
one-observation assertion before isolation. After isolation it passes all three
scenarios with counts five, five and one, and confirms original-rule restoration.
Scoped strict lint, formatting and whitespace checks pass. The full group and
both browser engines remain hosted checks; no authenticated provider interaction
or complete QA11 acceptance is inferred from this fixture correction.

The same run's Ubuntu Deno shard 2 job was cancelled during checkout, before
runtime setup or any test. Its log lines 217–218 show `git checkout` followed by
cancellation almost ten minutes later. The underlying checkout stall remains
unestablished; it is distinct from the reproducible browser fixture failure.

The [archive](data/ci-question-wording-fixtures.tar.gz) and
[manifest](data/ci-question-wording-fixtures.tar.sha256.json) retain both raw job
logs, metadata, the exact previous harness and the focused before/after results.
All 41 unchecked original requirements remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
