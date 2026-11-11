# Retain complete pending-turn coverage in context and watch checks

Issue [56](https://github.com/link-foundation/meta-sovereign/issues/56), [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57). This follows [whole-turn planning](whole-turn.md). It corrects test assumptions and adds diagnostics; the hosted Questions disclosure failure remains unresolved.

## Hosted evidence

Checks run [43048313548](https://github.com/link-foundation/meta-sovereign/actions/runs/43048313548), created 2026-11-11 15:26:04 UTC for `4916921fb16d8a186cb89c6c837b47f90311bc22`, finishes with failures. Complete downloaded workflow logs show the same three context assertions in Node, Bun and Deno: the earlier “We pay in USD” message remains actionable and introduces a numbered placeholder. For example, Linux Node job 130619945008 fails at job-log lines 6065–6150. Deno macOS failures are at complete workflow-log lines 42290–42323; Linux Deno failures are at 93230–93267.

The new free-text watch test also fails on Bun macOS/Windows and macOS Deno: it waits for the transient `prefilled` phase (macOS Deno complete workflow-log lines 42325–42335). Its fixture polls every four milliseconds while the mock watcher cycles every three milliseconds. A finite local trace records `starting → ready → prefilled → owner-draft`, with exactly one prefill and zero sends. Once the draft is present, the old predicate cannot succeed. There is no need to increase a timeout.

## Corrections

Context fixtures explicitly approve a no-reply rule for the known pay notices. Context selection still covers all five archived providers, chronological ordering, age bounds, foreign chats/sources, default values, vacancy evidence and typing-time invalidation. A pending-message edit now expects the stronger `answer-changed` refusal because the whole turn is frozen; saved-action edits retain `answer-review-required`. Both require zero dispatches and no outbox claim.

Separate assertions retain an unapproved notice and an unrelated question as numbered review items. A service message supplies an actual turn boundary. Deleted, pending or uncertain-delivery messages refuse the whole turn instead of producing a partial latest-only answer.

The finite watch check waits for the persistent draft-present phase, then verifies one actual complete numbered prefill and zero sends. It retains strict-selection, knowledge-change and cleanup coverage.

## Disclosure diagnostics

The earlier [WebKit disclosure failure](https://github.com/link-foundation/meta-sovereign/actions/runs/43040716998/job/130595251340) remains unexplained. Its screenshot shows the root Questions section closed. Opening-state diagnostics now run even when the initial editor wait fails, retaining bounded native click/toggle events, node identity and open/editor-visibility state. Production root-toggle diagnostics remain off by default and contain only root/open booleans.

One focused production WebKit matching scenario passes: one click, one root-open toggle and a visible editor. Independent Playwright MCP on an isolated memory-only server confirms the same root-toggle trace and visibility; shutdown reports zero model requests and zero sends. Its sole console error is the fixture's missing `/favicon.ico` (404). Neither local pass establishes the cause of the hosted failure. There is no change to disclosure behavior, wait budgets or UI rendering.

## Verification

- The unchanged context test fails locally before correction in the same three assertions as CI.
- Thirty-eight focused checks pass under Node, Bun and Deno, sequentially, in the three files below.
- The bounded phase probe, focused production WebKit matching check and independent MCP opening trace pass.
- Scoped formatting, strict lint, secret scanning and the existing duplication gate remain required.

```sh
node --test --test-concurrency=1 js/tests/question-context.test.js js/tests/question-pending-plan.test.js js/tests/question-browser-watch.test.js
bun test js/tests/question-context.test.js js/tests/question-pending-plan.test.js js/tests/question-browser-watch.test.js
deno test --allow-all --no-check js/tests/question-context.test.js js/tests/question-pending-plan.test.js js/tests/question-browser-watch.test.js
node experiments/issue-56/question-watch-phase-probe.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit QUESTIONS_MATCHING_ONLY=1 node js/tests/e2e-questions-browser.mjs
```

Sources, unchanged parent tests, full hosted workflow logs and focused outputs are retained in [the evidence archive](data/ci-pending-context.tar.gz) with a checksummed manifest. Exact new-head hosted checks, the closed disclosure, earlier Lino navigation failure and all unchecked issue-wide requirements remain unfinished. PR 57 stays draft and unmerged.
