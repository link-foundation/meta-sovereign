# Integrated sync and workplace validation

PR #57 integrates independently published workplace membership review
`d4c7fb81` and addressed WebRTC mesh `21bc514e` with a regular merge
`ad4f3820`. Both release-note consolidations are retained as history; the final
PR has exactly one added changeset. Both feature descriptions remain in it.
The generated browser bundle includes both implementations. The original
feature archives and screenshots remain unchanged.

## Hosted failure and reproduction

Checks run `43269083327`, created 2026-11-12 17:24:23 UTC for exact published
head `d4c7fb8122d3e708e584749a25a8ed5d63449bc0`, fails its Bun Linux and macOS
jobs. The complete raw job logs are preserved. Linux lines 5486–5564 and macOS
lines 4778–4843 identify the same exact capability assertion:

```text
+ cvTranslation: true
```

The translation service is available independently of browser packages; its
capability does not promise that an unconfigured model command will succeed.
The old exact-object expectation omitted this newly added capability. Browser
search, collection, export, Save observation and applications remain disabled
in the missing-browser fixture. Update that expectation while retaining every
other assertion; do not remove the translation capability.

The one relevant check fails before and passes after the expectation change:

```sh
node --test --test-concurrency=1 --test-name-pattern='capabilities report missing browser' js/tests/vacancy-search.test.js
```

No full local suite or runtime matrix runs. Both hosted Bun failures have
5,263 passing checks and exactly this one failure; other hosted jobs were still
running when their metadata was captured. New-head CI must be inspected.

## Integration verification

The combined mesh, signaling, transport and membership checks pass all 26
cases. Focused field review and workplace preparation/membership checks pass
23 cases. The native WebKit membership scenario passes all six cases, with
12 attachments drained, nine reads, zero provider Saves and no page errors.
Other browser engines and runtimes remain hosted checks.

Incoming changes introduced six length/complexity warnings. Extract field
binding validation, membership inspection, UI actions/rendering and native
fixture scenarios into focused functions. Retain every native assertion and
the same deadlines. All changed source and experiment files since `3483c8b1`
now pass ESLint with `--max-warnings=0`.

The first refactor browser run caught an accidentally omitted `recordId` in
the membership read. The preserved failure waits for the membership result.
Restore the exact record binding before the final six-case passing run. No
failing refactor bundle was published. The regenerated screenshots from that
run are archived separately; original committed evidence images are retained.

`data/mesh-membership-integration.tar.gz` and its per-file SHA-256 manifest
preserve raw hosted logs, parent/current assertion evidence, the initial
refactor failure, passing focused checks, relevant source snapshots and current
CI metadata. This unit does not complete shared-copy/new-record workflows,
offline snapshot reconciliation or any other unchecked original criterion.
Keep [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) draft
and unmerged.
