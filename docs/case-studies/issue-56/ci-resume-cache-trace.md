# Hosted résumé-cache discovery timeout

At source `ddd08a57a5d347fc5f09d5d4689411472a421188`,
[WebKit shard 1](https://github.com/link-foundation/meta-sovereign/actions/runs/44054688918/job/133944108610)
fails in `verifyResumeCacheRecovery`. Raw job log lines 961–979 identify the
initial discovery's unchanged 30-second wait for the third résumé row, at
`e2e-resume-cache.mjs:22`. The preceding six résumé inventory cases and language
scenario pass. This is before the cache test arms its deliberate persistence
refusal, so the log does not establish a persistence failure. It contains no
cache-specific request or pointer trace and no screenshot of the failed state.
The historical cause remains unconfirmed.

The unchanged focused scenario passes locally in WebKit. It discovers three
rows, refuses one subsequent snapshot, recovers the acknowledged list on desktop
and phone without another discovery, and closes all owned provider sessions
with zero provider clicks and no page errors. A second focused run with bounded
diagnostics also passes, recording the trusted inventory click, actual request,
200 response and three visible rows. These passes do not establish a repair.

The existing default-off `CI_RESUME_INPUT_DEBUG` trace now includes pointer and
click targets, résumé row count, bounded error status, and at most 32 phases of
the two résumé API paths. It excludes request bodies, entered text and keyboard
keys. The mandatory cache scenario traces the first click and successful load;
on failure it records bounded session status and captures a screenshot in the
existing browser artifact directory. No assertions, scenarios, engines, retries
or deadlines change. The existing CI flag enables the diagnostics.

```sh
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit CI_RESUME_INPUT_DEBUG=1 \
  node --max-old-space-size=384 experiments/issue-56/resume-cache-browser.mjs
```

Meanwhile the fresh WebKit shard 2 at the same source passes all four workplace
field cases. Its raw log lines 2487–2500 show the actual selection change,
trusted Load click, successful source and dictionary responses and visible
fields. This is positive diagnostic evidence for the earlier
[workplace timeout](ci-workplace-review-trace.md), whose historical cause also
remains unconfirmed.

The [checked archive](data/ci-resume-cache-trace.tar.gz) retains the actual failed
log, original browser artifact, passing workplace log, source/run metadata,
focused unchanged and traced receipts, and diagnostic source snapshots. A fresh
hosted run must verify the selected source. No original inventory criterion is
accepted by this diagnostic change. All 40 unchecked criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.
