# Final-period configuration in form planning and recovery

Form CLI commands and owned review planning discarded an explicit final-period
preference. HTTP handlers also dropped the field, and automatic prefill request
identity did not include it. A configured `without` preference therefore filled
`English.` from observed `English` (four) and `English.` (one), while a retry with
a different preference could silently recover the earlier receipt.

## Reproduction and correction

Six finite tests fail against the exact six published parent modules from
`d464aa39c523b160611ebf85ed1cb8f421a61214`, with current dependencies:

```sh
node --max-old-space-size=384 --import ./experiments/issue-56/forms-period-before.mjs --test --test-concurrency=1 js/tests/forms-period.test.js
```

Forms CLI commands now use the shared isolated CLI/environment/Lino configuration
resolver. Both default Lino formats retain the validated override for standalone
plans, owned review plans and automatic prefill. The frozen reviewed plan retains
the preference during the final knowledge check. Request identity includes the
explicit preference; changing it requires a new request ID. Invalid values refuse
before provider inspection, and CLI validation precedes opening the store.

The correction preserves shared saved policy, raw answer observations, owner
answers, knowledge/document rechecks, receipt recovery and manual submission.
There are no new UI controls: the existing shared policy still supplies the
default, and explicit request or process settings override it for that operation.

## Focused verification

The six new tests cover actual CLI planning and initial/interactive form review,
selected `.lenv` configuration, reviewed application, both Lino route families,
invalid inputs, changed retry preferences, unchanged recovery and owner edits.
They pass with 18 existing automatic-prefill/control tests. Fifteen existing
review/application tests also pass. These are focused local checks; full runtime
and browser matrices remain in hosted CI.

The existing mandatory native automatic-form scenario now checks the preference
on a manually opened second page, five actual observations, changed-preference
refusal and recovery without repeating a DOM input event. Its original first-page
text/choice/PDF, owner-content, cross-origin, next-page and no-submit assertions
remain active. The parent run fails at the new actual-value assertion; the fixed
run records `English`, count five, recovered receipts and zero submissions.

![Before: the explicit preference is lost](../../screenshots/issue-56-forms-period-before.png)

![After: the actual form contains the configured spelling](../../screenshots/issue-56-forms-period-after.png)

Independent Playwright MCP uses a fresh temporary server and synthetic owned form.
Its probe waits for the initial read before starting a plan. The initial probe
raced that read and received explicit busy refusals; its later changed-preference
call was the first admitted write. Those raw diagnostic results are retained
separately and are not counted as a successful correction check. A separate first
invocation error came from the MCP expression wrapper, before any page action.

The corrected independent probe confirms `English`, count five, one applied
receipt, unchanged recovery and changed-preference refusal. Closing the owned
session records one DOM input event, the actual `English` value, no submissions
and a closed browser. The MCP page and temporary server are also closed.

The [evidence archive](data/forms-period-configuration.tar.gz) and
[manifest](data/forms-period-configuration.tar.sha256.json) preserve raw failures,
focused results, screenshot hashes and exact source/parent bytes. The parent hook
substitutes six modules; it does not represent a full prior checkout.

This is a partial QA11 correction in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
Strict scoped lint, formatting and secret checks pass. The first duplication
check exceeded the unchanged 6.5% limit; reusing the probe's read/control locators
and removing repeated setup preserves all assertions. The raw initial report is
retained alongside the final passing check.

Full QA11 acceptance, fresh exact-source hosted verification and all other
unchecked original criteria remain required. Acceptance remains 77 of 118, with
41 unfinished requirements.
