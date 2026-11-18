# Preserve the recurring native selection failure

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains a draft.
Current-head run 43752266837, commit `3659e48941ef520bcc06298a15c05bbbf3a1b80b`,
failed WebKit shard 2/4 in `verifyVacancySelection`. Its complete log lines
1684–1701 show a 30-second wait for the first card's `needs-description`
decision. The preceding five vacancy cases passed, including their native
search and description-cache checks. The uploaded summary identifies only
`vacancies` as failing; it contains no selection failure screenshot.

The single owned local selection case passed in WebKit with tracing enabled.
That retry does not explain the hosted failure. The earlier
[selection evidence](vacancy-selection.md) records the same unexplained local
timeout. Its tracing was opt-in and the hosted wrapper supplied no screenshot
directory, so CI omitted the evidence needed to distinguish input loss,
incorrect decisions and stale rendered state.

The scenario now uses the existing CI artifact directory by default. Failures
retain the exclusion field, summary, cards, exact rendered reason attributes,
acknowledged local settings and a screenshot before fixture cleanup. Explicit
local screenshot paths retain their existing names. Fixture data is synthetic;
no authenticated provider or user server participates. Existing opt-in tracing
also remains available outside CI. No assertion or timeout changes.

```sh
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit E2E_TRACE_SELECTION=1 \
  NODE_OPTIONS=--max-old-space-size=384 \
  node experiments/issue-56/vacancy-selection-browser.mjs
```

This is an evidence correction, not acceptance of the unresolved failure. The
next exact-head hosted run must be inspected and any reproduced discrepancy
fixed with a deterministic regression before this criterion can be accepted.
