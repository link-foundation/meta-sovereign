# Hosted workplace source-loading timeout

At published source `94efd84bfcd43304d4986494efded5652bb889ec`,
[main checks](https://github.com/link-foundation/meta-sovereign/actions/runs/44047174048)
completed with 52 successful jobs, three skips and two failures. The underlying
failure is WebKit shard 2; the other failure is its pipeline aggregate.
Desktop release, security, Pages and link checking passed for the same source.

The preserved job log identifies the exact failure at lines 2480–2501:
`configureReview` selected an export and clicked Load, then its existing
30-second wait for `[data-cv-workplace-fields]` expired. The preceding native
About and description preparation scenarios passed. Salary scenarios later in
the same shard also passed. Pipeline log lines 368–370 report the browser
failure rather than another cause. Downloading the entire run exceeded the
GitHub CLI's API-request limit; the retained individual job logs and browser
artifact contain the actual failure.

One focused, unmodified WebKit scenario passes all four workplace-field cases
locally, including the source load, all nine proposed fields, owner-edit and
identity refusals, and lost-reply recovery on a phone. It records seven matching
attach/detach operations, zero native saves and no page errors. This local pass
does not identify the hosted cause or establish a repair.

The mandatory scenario now has opt-in `CI_CV_WORKPLACE_DEBUG=1` tracing. It
retains at most 24 request phases and DOM events, with request paths/statuses,
selection presence, disabled state, field presence and bounded error status.
It excludes selected identities and workplace text. A failure captures a
screenshot in the existing browser artifact directory. Diagnostics are off by
default and enabled in the existing hosted browser jobs. No test assertion,
scenario, engine or deadline is removed or increased.

The same four focused WebKit cases pass with tracing enabled. The receipt shows
the actual selection change and trusted Load click, then successful source and
dictionary responses and visible fields. All owned fixtures close. Reproduce
that bounded check with:

```sh
CI_CV_WORKPLACE_DEBUG=1 RUN_BROWSER_E2E=1 E2E_BROWSER=webkit \
  E2E_ARTIFACT_DIR=artifacts/workplace-review-trace \
  node --max-old-space-size=384 experiments/issue-56/workplace-review-trace.mjs
```

The [checked archive](data/ci-workplace-review-trace.tar.gz) preserves the failed
job and pipeline logs, full browser artifact, run metadata, unchanged-source
local pass, traced local pass and diagnostic sources. A fresh hosted run remains
required. The historical cause remains unconfirmed. All 40 unchecked original
requirements remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.
