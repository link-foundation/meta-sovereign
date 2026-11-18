# Share CV verification fixture setup

Exact published head `242d4ccddff0faf2ff53207e71125478b68dddf8` starts Checks
[43245201058](https://github.com/link-foundation/meta-sovereign/actions/runs/43245201058)
at 2026-11-12 15:12:04 UTC. Job 131276299273 passes ESLint and formatting, then
fails the unchanged 6.5% duplication gate (raw log line 10441; process failure
14113). This differs from the earlier locked-formatter failure. Both independently
developed cancellation test sets remain present after the forward merge.

The combined workplace/cancellation tree also reproduces the duplication
failure locally: 41,126 duplicated lines among 630,001 lines, or 6.53%.
The change shares actual-parent replay/restoration and the three existing
isolated review-server fixtures. Every original command, parent revision,
scenario, counter, availability state, preparation adapter and signal cleanup
remains. JSON is still only the local experiment control protocol; production
requests retain their existing Lino transport. No duplication threshold,
exclusion, assertion, deadline or mandatory browser entry changes.

The existing cancellation replay still produces both expected actual-parent
failures and restores the source bytes. Three finite real server probes confirm
startup metadata, zero provider reads/writes and acknowledged drained shutdown.
The repeated setup is removed without dropping either regression set.
The first shared-fixture measurement passes the unchanged gate at 40,911 duplicated lines among
629,854 lines (6.50% rounded). Including the reusable verification/collection scripts,
the final gate passes at 40,911 among 629,917 lines (6.49%). The focused merged integration run passes 61 Node
and 61 Deno checks; hosted matrices for the published correction remain required.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/cv-prepare-cancel-before.py
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/verify-cv-fixture-servers.py
NODE_OPTIONS=--max-old-space-size=384 npm run check:duplication
```

The [checksummed archive](data/ci-cv-fixture-duplication.tar.gz) retains exact-head
metadata and raw failed-job logs, before/after duplication reports, replay and
fixture logs, current helpers and their original sources. This CI correction
does not complete any remaining product criterion in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
