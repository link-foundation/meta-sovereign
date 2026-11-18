# Batch receipt completion and test-tag diagnostics

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The exact `4363ddd9` Checks run `44266058270` had two independent
WebKit failures. Shard 3 failed before testing: job `134672910805`, log
line 407, could not resolve `github.com` while fetching main. Shard 2
job `134672910804` reached `verifyNativeApplicationBatch`; line 2814
reports the unchanged 10-second confirmation timeout. Its displayed
`jobs-application-unconfirmed` state does not establish which response
failed. A failed-job rerun was requested after the run completed.

One isolated WebKit probe at the exact published source passed. A second
probe at `3a742654` reproduced the same waiting assertion, but with a
different, positively established cause: the continuation response is HTTP
200 with `delivery: provider-confirmed`. The batch then owns the next
vacancy. The helper waits for Read to become enabled for the old vacancy,
which intentionally cannot happen while the batch owns another review.
The complete raw responses and source snapshots are preserved; this does
not explain the earlier hosted unknown receipt.

The helper now waits for renewed confirmation, an idle recovery control
and absence of the unknown-status marker. It still cannot accept a failed
or unacknowledged action. The existing native assertions require exactly
two confirmed deliveries, one manual delivery, four locales, phone layout,
no replay after reload and closed resources. The deadline is unchanged.
Failure-only diagnostics now retain at most 32 synthetic mutation receipt
summaries, validate application receipts against their actual request, and
drain outstanding response reads before closing the fixture. They omit
question, answer, letter and report bodies.

The separate security run `44271153380` failed its unchanged CodeQL gate
at log lines 19397–19399: `js/bad-tag-filter` in
`job-deferred-questions-interface.test.js:193`. This was a negative test
assertion rather than production sanitization. Direct string assertions
retain the escaped-script check and reject raw script prefixes without
the misleading tag-filter regex. The four translated private-content
tests still exercise production React rendering and uncertain-write refusal.

Reproduce the bounded batch with:

```sh
MS_JOBS_APPLICATION_DEBUG=1 node --max-old-space-size=384 \
  experiments/issue-56/batch-confirmation-webkit.mjs
```

The saved before probe fails at the waiting assertion; the corrected probe
passes every existing delivery assertion. The exact-parent helper restores
all source and bundle bytes after its single scenario. Eighteen focused
interface/session checks pass with concurrency one; scoped lint and format
pass. Full matrices and CodeQL remain hosted checks for the published head.
No runtime behavior or delivery guard is relaxed. The inventory remains
88 verified and 30 unfinished; PR57 stays draft and unmerged.

`data/ci-batch-receipts.tar.gz` and its SHA-256 manifest retain the failed
jobs, successful exact-parent probe, failing current-source probe, corrected
probe, focused results, production/test snapshots and collector. The older
[hosted timeout record](ci-batch-confirmation.md) remains historical evidence.
