# Preserve successful strict link checks between runs

Exact-source `1b449fb5` [run 44184759939](https://github.com/link-foundation/meta-sovereign/actions/runs/44184759939)
failed twice. Attempt one reported two GitHub HTTP 503 responses; both source
URLs passed a finite direct native recheck. Attempt two reported eighteen error
entries across seventeen different GitHub URLs, at raw log lines 537–560. Both
native pacing and retry controls passed. Its 588 unique URLs produced 2,152
successful occurrences, but every rerun started with an empty cache.

The existing `--cache --max-cache-age 1d` flags only create a file in the current
checkout. The workflow had no restore/save action, so a new runner repeated the
successful requests as well as the failed requests. This local omission is
confirmed by the workflow and finite cold-check controls. Repeated external
503 responses are consistent with GitHub request pressure; that remote cause
remains an inference, not a proven diagnosis of GitHub's infrastructure.

The workflow restores `.lycheecache` under a ref- and policy-scoped key and saves
partial successes before its existing strict final failure. Each run/attempt has
a distinct save key. The native one-day timestamps remain authoritative: using
a restored entry does not renew its original timestamp. Changed policy hashes
invalidate old caches. The cache only contains public URL/status metadata;
credentials and executables are not included.

Actual native tests show that failed responses are not persisted. A recovered
503 is fetched again on the next run; persistent 404 and 503 responses still
fail on every run, and an expired successful page is fetched again and can fail.
The native cache contract, host pacing and transient-retry controls run on every
hosted link check. Saving requires successful cache verification. A cache miss
or denied optional cache write falls back to the full strict check. Acceptance
codes, exclusions, retries, request concurrency and the ten-minute deadline are
unchanged; archived copies remain repair suggestions.

## Reproduce and verify

```sh
git show 502b0b07:.github/workflows/links.yml > ci-logs/lychee-cache-parent.yml
python3 -B experiments/issue-56/lychee-cache-policy.py /path/to/lychee --workflow ci-logs/lychee-cache-parent.yml
python3 -B experiments/issue-56/lychee-cache-policy.py /path/to/lychee
node --max-old-space-size=256 --test --test-concurrency=1 js/tests/lychee-report.test.js
```

The parent workflow fails one lifecycle assertion while four native controls
pass. The corrected workflow passes all five checks: workflow ordering/guards,
cold repeated requests, partial-failure recovery from saved bytes, permanent
failure handling and one-day expiry. These fixtures use one native worker,
finite loopback inputs and awaited server closure; they do not emulate GitHub's
cache service. Hosted restore/save receipts and exact-source link results remain
required before claiming CI recovery.

Source behavior was checked against the official [native cache implementation](https://github.com/lycheeverse/lychee/blob/f10ac2774dac100dfdbf014647487520a8ffe08d/lychee-bin/src/cache.rs)
and [separate restore/save actions](https://github.com/actions/cache/tree/v6.1.0).
The [evidence archive](data/lychee-cache.tar.gz) and
[manifest](data/lychee-cache.tar.sha256.json) retain the exact parent workflow,
both failed attempts, reference snapshots, native receipts and scoped checks.

The unchanged cold-cache [weighted-rewording commit link run](https://github.com/link-foundation/meta-sovereign/actions/runs/44189781212) also passes. This confirms that the prior failures were intermittent; it does not establish that caching fixed those attempts. The cache change reduces repeated successful requests and still needs its own hosted restore/save receipt.

Every unfinished original requirement remains required. **83 of 118 criteria
are accepted; 35 remain unfinished.**
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and
unmerged.
