# External Research

This investigation used external references to validate the CI/CD
patterns and the async failure mode.

## Deno Pending Promise Behavior

The failed log ended with:

```text
error: Promise resolution is still pending but the event loop has already resolved
```

Deno issue
[`denoland/deno#13146`](https://github.com/denoland/deno/issues/13146)
documents the same class of failure: a test can leave an unresolved
promise after the event loop empties, and Deno reports this pending
promise state. That matched the CI evidence: the suite reported all
assertions passing, then the process failed because one awaited promise
never resolved.

Deno's `deno test` documentation confirms this repository is using the
standard test runner entry point:
<https://docs.deno.com/runtime/reference/cli/test/>.

## IndexedDB Transaction Completion

MDN documents the `IDBTransaction` `complete` event separately from
individual object-store request success events:
<https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event>.

That distinction is the important storage fact. A successful
`objectStore.put()` request is not the same as transaction completion.
Code that needs durable transaction completion must listen for the
transaction lifecycle before starting work that can complete quickly.

## GitHub Actions Matrix and Timeout Behavior

GitHub Actions workflow syntax documents
`jobs.<job_id>.strategy.fail-fast`, including that matrix fail-fast
defaults to true unless explicitly disabled:
<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast>.

The same workflow syntax documentation covers job-level
`timeout-minutes`:
<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes>.

These references support the existing workflow design:

- Keep `fail-fast: false` for the test matrix so all runtimes and OSes
  produce evidence.
- Keep finite job timeouts so hangs surface quickly.
- Fix the pending promise rather than hiding the Windows Deno failure.
