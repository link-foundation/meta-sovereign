# Retain the hosted runner's archive fallback

Investigation for [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57). This CI setup correction leaves all unfinished issue 56 requirements open.

## Reproduction and evidence

The completed [Checks run 43055400720](https://github.com/link-foundation/meta-sovereign/actions/runs/43055400720), created at 2026-11-11 16:08:57 UTC for `e0b0bbdcd11b06679337a5c5b40e72f02da9af5d`, passes WebKit, every runtime job and the static/native checks. Chromium fails before browser tests. Its preserved raw [job log](https://github.com/link-foundation/meta-sovereign/actions/runs/43055400720/job/130645101775) lines 507–509 download Microsoft's package indexes, while lines 510–541 fail to resolve the Ubuntu archive/security hosts. Lines 662–670 fail nine package downloads and line 674 records exit 1. The separate [Pages run 43055400825](https://github.com/link-foundation/meta-sovereign/actions/runs/43055400825) is cancelled during dependency installation after the same Ubuntu DNS failures (raw lines 1299–1324).

This does not establish why those hosts fail DNS or whether Azure is reachable on the failing runner. It does expose a repository defect: our setup helper replaces the Azure URL in the runner's mirror list with the primary archive URL, leaving two primary entries and no Azure fallback. A finite temporary-file regression reproduces that loss on parent `12423a3757b470ce3e7c04e35bf53025c5a48a09`. A second regression reproduces lost metadata-bearing fallback entries. Both fail before the correction.

The pinned [runner source](https://github.com/actions/runner-images/blob/741e4eb8ef5f51698d730ac16ede65cadb067522/images/ubuntu/scripts/build/configure-apt-sources.sh) configures Azure, the primary archive and the security archive with priorities 1, 2 and 3. The [APT mirror transport manual](https://manpages.debian.org/unstable/apt/apt-transport-mirror.1.en.html), checked on 2026-11-11, documents lower priorities first and automatic fallback after a failed acquisition. Both sources are preserved in the evidence archive.

## Correction and focused verification

For the hosted `apt-mirrors.txt`, the helper exchanges the recognized primary/Azure priority values when Azure currently has precedence. It retains both original URLs, every other metadata field, security entries and the source indirection. Already preferred, incomplete and unrecognized lists stay unchanged. Direct legacy/deb822 sources keep the existing primary-archive preparation. Repeated preparation is idempotent.

Twenty-seven focused checks pass, including both parent failures, metadata preservation, incomplete lists, idempotence and all three Linux browser setup contracts. Strict lint and workflow policy pass. No package installation, system APT changes, browser matrix or full test suite runs locally. Browser coverage, signature checks and job deadlines remain unchanged.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-browser-apt.test.js js/tests/ci-contracts.test.js js/tests/ci-action-warnings.test.js js/tests/ci-cache-policy.test.js
NODE_OPTIONS=--max-old-space-size=384 node js/scripts/check-ci-workflows.mjs
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/collect-apt-fallback.py
```

The [verified archive](data/apt-fallback.tar.gz) retains the actual parent source, two failing regressions, focused results, raw failed jobs, completed workflow metadata and primary documentation. Exact new-head hosted CI must verify network acquisition and the new conversation-history browser cases. Retaining a fallback does not claim to repair external DNS; older unexplained browser failures and all unchecked issue criteria remain unfinished. PR 57 stays draft and unmerged.

## Hosted follow-up

The [Pages run 43062262005](https://github.com/link-foundation/meta-sovereign/actions/runs/43062262005) for `1a35532cb2c87593cb887ebaec0e4e45f221d72b`, created at 2026-11-11 16:50:28 UTC, passes. Its raw log records the mirror source update at line 246, 139 MB acquired in 42 seconds at line 650 and the API-only/optional-local-UI browser result at line 2036. This verifies dependency acquisition on that runner; it does not establish which fallback was used or explain the earlier DNS outage.

The same commit's [Security run 43062262048](https://github.com/link-foundation/meta-sovereign/actions/runs/43062262048) fails. Raw log lines 4084–4086 identify `py/incomplete-url-substring-sanitization` in this evidence collector at line 8. That line asserts that a failing test log contains the Azure hostname; it does not validate a URL. The collector now asserts the specific regression test name instead, with the same required two failures. Its source inventory is explicit so regenerating this archive cannot include unrelated, unverified working changes. The security finding is retained in the archive; the corrected collector still requires hosted CodeQL verification.
