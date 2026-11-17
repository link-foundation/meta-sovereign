# Unread model context direction assertion

The `0041b2a8859ccf157f36fe82c9b52d0aeed285df` hosted
[Deno Linux shard 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44080958326/job/134035564618)
passed 2,279 tests and failed one assertion. Its preserved raw log identifies
`question-unread-model.test.js:38` at lines 4743–4759: the recent owner reply
correctly includes `outgoing: true`, while the expected object omits that field.
[Bun Linux](https://github.com/link-foundation/meta-sovereign/actions/runs/44080958326/job/134035564426)
has the same mismatch at lines 4950–4997 and reports one failed test at 11595–11600.

The [incoming-employer correction](salary-employer-context.md) deliberately
retains direction in bounded context. Salary interpretation can then ignore
owner replies without deleting the owner's words from generic/model knowledge.
The old unread-model assertion was missed when that representation changed.
The exact expected array now includes the direction flag. All existing model,
history, approval, count, review, cancellation and zero-send assertions remain.
Production code, test deadlines and workflow coverage are unchanged.

## Reproduction and focused verification

On the published parent, the existing named test fails in 0.6 seconds:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 \
  --test-name-pattern='unread model opt-in uses stored CV' \
  js/tests/question-unread-model.test.js
```

After correcting its expected context, all eleven tests in this one relevant
file pass on Node and Deno, with no local full suite or runtime matrix. These
checks include real CLI and both Lino encodings with an injected synthetic
model, held review recovery, changed-knowledge refusal and drained cancellation.
They start no model process and contact no provider.

The [checked archive](data/ci-unread-model-direction.tar.gz) and
[hash manifest](data/ci-unread-model-direction.tar.sha256.json) retain both hosted
failures, the exact parent test, focused before/after logs, static checks and
this collector. Fresh exact-source hosted verification is still required.
No acceptance criterion changes; all forty original unchecked criteria remain
active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
