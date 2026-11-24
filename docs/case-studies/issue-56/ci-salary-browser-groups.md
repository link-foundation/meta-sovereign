# Independent salary browser budgets

At published source `06953e31`, [WebKit partition 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44093457474/job/134077326110)
finishes all four native question-control scenarios, including the previously
failing disclosure opener. Raw log lines 2357–2402 record their successful
receipts. Salary clarification then passes its eight nested cases in 64 seconds;
wording passes in seven seconds. Vocabulary starts at line 2416, immediately
before the parent reaches its three-minute deadline at lines 2417–2425.
The six completed scenarios account for 176 seconds of work. This establishes
an exhausted combined budget; the trace does not establish a vocabulary hang.

Keep the four question-control scenarios together and give salary contexts and
salary wording separate mandatory entries with three top-level scenarios each.
Append both entries so existing checks retain their partitions. Clarification,
template context and priority run in partition 4; wording, vocabulary and intent
run in partition 1. Both engines retain every scenario, the same native assertions,
owned fixture cleanup, three-minute group bounds and 35-minute job bounds.
The old salary-only environment flags still delegate to their selected scenario.

The existing mandatory workflow contract now requires both entries and all six
salary scenario names exactly once. It fails on the preceding registration and
passes after the change. Six focused registry/runner checks also pass. One
focused native WebKit run of the new context entry passes all three top-level
scenarios in 111 seconds, preserving owner drafts and rules with zero sends.
The full browser/runtime matrices remain hosted validation.

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='question provider and control scenarios' \
  js/tests/ci-contracts.test.js
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit \
  node js/tests/e2e-question-salary-context-browser.mjs
```

The QA12 evidence collector resolves the mandatory scenario groups and their
actual partitions from the selected source, retaining the historical layout
for old runs. It still requires all five successful workflows, all named tests,
every semantic receipt and complete scenario success in both engines. The
failed `06953e31` workflow cannot satisfy that gate.

The [checked archive](data/ci-salary-browser-groups.tar.gz) retains the complete
failed job log, metadata, before/after registration, focused regression and
native result. No original acceptance criterion is completed by this CI repair.
All forty unfinished criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
