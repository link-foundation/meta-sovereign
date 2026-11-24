# Application answer and salary browser budgets

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The mandatory browser registry separates application salary verification from
answer approval and context verification. All thirty unfinished original
criteria remain required; this correction establishes no provider acceptance.

## Exact-source hosted failure

Run [44418378152](https://github.com/link-foundation/meta-sovereign/actions/runs/44418378152)
tests source `9c369eaf45d8d33c2b095924d7f956defef2ee3c`.
Its WebKit shard 5 [job 135207203393](https://github.com/link-foundation/meta-sovereign/actions/runs/44418378152/job/135207203393)
has a preserved complete 1,020-line log:

- Lines 925–930: answer approval, answer context and manual salary pass in
  32,870, 41,889 and 50,793 ms. Salary batch starts with about 55 seconds left.
- Line 931: the enclosing Node process reports `ETIMEDOUT`.
- Line 938: the answer group exits after 180,887 ms, exceeding its unchanged
  180-second budget. No individual batch assertion reports a failure.

This proves the group exhausted its cumulative budget. It does not prove the
batch scenario would have passed on that runner with a separate budget.

## Correction and reproduction

The answer group now runs approval, context and the existing language scenario.
The salary group runs manual salary and salary batch. The standalone language
command remains available; its former mandatory registry slot now holds salary.
All 38 application scenarios, including the new transient refusal check, execute
exactly once. The complete registry retains 160 entries, eight shards per engine,
twenty entries per shard, both browser engines, 180-second entry deadlines and
35-minute job deadlines. Individual fixtures and assertions are unchanged.

```sh
python3 -B experiments/issue-56/application-answer-budgets-before.py
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/ci-browser-shards.test.js js/tests/ci-contracts.test.js
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/application-answer-budgets-webkit.mjs
```

The actual implementation parent `5525aaa0` fails the new independent salary
budget contract with ten passing controls. The replay restores all replaced
sources in `finally`. The corrected layout passes all 31 focused CI checks.
The isolated native WebKit salary-batch probe retains real application forms,
salary floor readback, four locales, phone layout, durable completion and
nonreplay checks. It passes in 66,675 ms; its two confirmed submissions target
owned offline fixtures, and all owned browser resources close.

The [checksummed archive](data/application-answer-budgets.tar.gz) preserves
the exact hosted log and metadata, parent/current sources and finite verification
results. Local execution uses one browser and a 384 MiB Node heap. Complete
runtime/browser matrices and successful published-source CI remain required.
