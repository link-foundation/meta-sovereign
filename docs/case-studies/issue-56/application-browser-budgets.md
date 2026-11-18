# Independent application browser budgets

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The mandatory browser registry now separates long application workflows while
retaining every scenario and the existing deadlines. This corrects a cumulative
budget problem; all thirty unfinished original criteria remain required.

## Hosted reproduction

Run [44392503456](https://github.com/link-foundation/meta-sovereign/actions/runs/44392503456)
tests source `f34c800a53b6a2c7337677dc81c477642f88bfa7`. Its WebKit shard 4
[job 135121991350](https://github.com/link-foundation/meta-sovereign/actions/runs/44392503456/job/135121991350)
fails two groups. The preserved full log has 1,251 lines:

- Lines 1131–1144: both resume-visibility scenarios pass in 41,883 and 11,310 ms.
  The saved-refusal scenario then starts, including its three nested preview
  owners. The whole group expires after 180,112 ms without a final scenario receipt.
- Lines 1146–1161: feedback, collection and preview pass in 103,462, 32,199 and
  27,999 ms. Search starts with about twelve seconds left. The group expires after
  180,131 ms without an individual assertion failure.

The latter group allocates too little of its existing total budget to its final
independent workflow. The saved-refusal log does not establish which nested
operation took longest. Separating its independently owned preview scenarios
also exposes their own started/passed receipts in future hosted diagnostics.

## Retained coverage and verification

Feedback, native search routing, saved refusals and preview refusals now have
independent mandatory entries. Collection and ordinary vacancy preview remain
together. Resume visibility retains both visibility checks and unavailable
vacancies. Preview refusal no longer runs inside saved refusal. The complete
application registration contract requires all 37 scenarios exactly once.

The four appended entries bring the registry to 160. Both engines retain the same
eight disjoint shards, each with twenty entries. Each entry retains its existing
180-second limit and each job its 35-minute limit. No checks, assertions, locales,
owner-preservation rules or cleanup paths are removed.

```sh
python3 -B experiments/issue-56/application-browser-budgets-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/ci-browser-shards.test.js js/tests/ci-contracts.test.js js/tests/ci-native-focus.test.js
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit NODE_OPTIONS=--max-old-space-size=384 node js/tests/e2e-job-application-vacancy-skips-browser.mjs
```

The actual parent layout fails the two new registration requirements while eight
independent controls pass; every replaced source is restored in `finally`.
All 31 focused CI contracts pass. One isolated WebKit saved-refusal scenario
checks six link variants, durable recovery, refused reopening, four languages,
persisted clearing, zero submissions and closed owned browsers. Full browser and
runtime matrices remain hosted. The first parent replay's incorrect expected
control count is retained as a harness diagnostic and corrected to eight.

The [checksummed evidence archive](data/application-browser-budgets.tar.gz)
preserves the complete failed job log, downloaded artifact, actual parent/current
sources and finite verification logs. Successful published-source CI remains
required; passing registration contracts alone cannot establish a hosted pass.
