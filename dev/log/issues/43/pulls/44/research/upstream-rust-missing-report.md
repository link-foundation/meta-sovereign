Found during the complete template comparison for https://github.com/link-foundation/meta-sovereign/pull/44 (issue 43).

## Reproduction

At revision `0ece2cf2c2745c3574ffb65dbabdfcadd7163c14`, in a fresh checkout with no `lychee/missing-report.md`:

```sh
LYCHEE_OUTPUT=lychee/missing-report.md LYCHEE_EXIT_CODE=2 node scripts/check-web-archive.mjs
```

Expected: nonzero status explaining that the failed checker produced no report. Current missing-file branch explicitly sets `all_archived=true` and exits/returns 0. This can suppress the workflow's final failure condition when lychee crashes, cannot write its report, or the configured paths disagree. The missing-file branch itself is the static reproduction; downloaded template reference code was inspected without executing it.

Source: https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/blob/0ece2cf2c2745c3574ffb65dbabdfcadd7163c14/scripts/check-web-archive.mjs#L313

This differs from the previously reported non-HTTP parsing and recovered-link aggregation defects: there is no report to parse at all.

## Workaround

Make the workflow fail on any nonzero lychee exit, independently of `all_archived`; use archive URLs only as repair suggestions. Preserve the report as an artifact with `if-no-files-found: error`.

## Suggested code fix

Treat a missing report as an error (throw or return 1), write `all_archived=false`, and add a subprocess regression test with a nonexistent `LYCHEE_OUTPUT` and a nonzero checker exit. The test must assert a nonzero process exit and no `all_archived=true` output. Handle an unreadable or empty/malformed report after a failed checker the same way.

The downstream PR implements a missing-report regression test and an independent final lychee exit gate. No network or Wayback access is needed to reproduce this branch.
