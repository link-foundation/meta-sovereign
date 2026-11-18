# Keeping native application checks within their group deadline

PR: https://github.com/link-foundation/meta-sovereign/pull/57

Exact-head run `43569152391` tested published `e8533c0c478ee997c3974caf63798bd74e1619f3`.
WebKit shard 2, job `132370299236`, failed after the native application group
accumulated eleven scenarios under one 180-second subprocess deadline.

The preserved log has 1,617 lines. Lines 1526–1546 show the group starting and its
first ten scenarios passing. Line 1547 starts popup recovery roughly 168 seconds
into the group. Line 1548 reports `ETIMEDOUT`, and line 1554 records completion
after 180,127 ms. This establishes aggregate deadline exhaustion; it does not
establish an individual popup scenario hang. Earlier groups and the other native
application scenarios completed.

The registry now runs core/recovery, drafts/run modes/deferral, and
holds/retries/supervision/popup as separate groups of four, three and four. Each
still uses the existing native fixture and assertions. Both mandatory engines,
four shards, the 180-second group deadline and the 35-minute job deadline remain
unchanged. No scenario was removed. Entries appended to the registry preserve the
existing assignments of older groups.

A focused regression reads the actual registered entry files, rejects a group
larger than four and checks all eleven scenarios appear exactly once. It fails
against the parent registration and passes after the split. All five focused
runner tests also verify engine/shard coverage and actual child failure
propagation without launching browsers:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/ci-browser-shards.test.js
```

The complete hosted job log and browser artifact, failing and passing local
checks, and source snapshots are preserved in `data/ci-application-groups.tar.gz`
with a per-file `data/ci-application-groups.tar.sha256.json` manifest. Hosted
execution of the new groups is still required for the published head. Every
original incomplete acceptance criterion remains required; PR57 stays draft and
unmerged.
