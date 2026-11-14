# Browser CI setup exhausted its deadline downloading Ubuntu packages

Investigation for [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
This changes CI setup only; remaining issue 56 criteria stay open.

## Evidence and cause

Two independent Pages runs reached the same 15-minute job deadline:

| Run                                                                                       | Head       | Evidence in the complete log                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [42804967429](https://github.com/link-foundation/meta-sovereign/actions/runs/42804967429) | `48a13ae1` | Line 1210 requests 139 MB; line 1407 reports 13 min 26 sec downloading at 172 kB/s. The job is cancelled at line 2754, shortly after browser testing starts.                                      |
| [42812224902](https://github.com/link-foundation/meta-sovereign/actions/runs/42812224902) | `6c015033` | Line 1214 requests 139 MB. Lines 1270–1282 retry the Azure mirror before obtaining a package from the primary archive. Further downloads stall, and line 1295 cancels setup before browser tests. |

The latest run was created at 12:01:23 UTC on 2026-11-10. Its built-bundle
job ran from 12:04:32 to 12:19:47. Slow package transfer and retries consumed
the deadline; these logs do not show an application assertion failure.
Other browser assertion failures remain separate investigations.

The [Ubuntu package archive documentation](https://ubuntu.com/project/docs/how-ubuntu-is-made/concepts/package-archive/)
identifies `archive.ubuntu.com` as the primary archive and documents deb822
sources on current releases. [Playwright's CI instructions](https://playwright.dev/docs/ci)
require installation of browser system dependencies. The change keeps that
installation and switches the observed slow Azure mirror to the primary HTTPS
archive. This is a targeted routing correction, not proof that every future
archive transfer will be fast.

## Hosted verification exposed an incomplete correction

All five workflows passed on `e280197a`, but the complete Pages log for
[42816515218](https://github.com/link-foundation/meta-sovereign/actions/runs/42816515218)
shows **zero updated source files at line 245**. Line 258 loads
`file:/etc/apt/apt-mirrors.txt`; lines 262–265 still use Azure. Line 644 fetches
139 MB in nine seconds. This was a healthy transfer from the unchanged mirror,
not evidence that the original helper changed the hosted configuration.

The pinned [runner image configuration](https://github.com/actions/runner-images/blob/741e4eb8ef5f51698d730ac16ede65cadb067522/images/ubuntu/scripts/build/configure-apt-sources.sh)
creates this mirror-list file with tab-separated priorities and points both
legacy and deb822 sources at it. The [APT mirror transport manual](https://manpages.debian.org/unstable/apt/apt-transport-mirror.1.en.html)
describes URI lines, optional metadata and priority ordering. Both primary
sources were checked on 2026-11-10. A temporary-file regression matching that
format fails on the earlier helper: expected one changed file, received zero.

## Change and verification

`js/scripts/prepare-browser-apt.mjs` changes only complete Azure Ubuntu archive
URLs in active `.list` and `.sources` files and the hosted `apt-mirrors.txt`. It preserves suites, components,
signature keys, security sources, mirror priorities, source indirection and other repositories. Missing legacy files
are harmless, repeat execution changes nothing, and other filesystem errors
fail setup. All three Linux browser dependency installs run preparation before
Playwright. The macOS lane skips it.

The workflow regression fails before the change because Pages installs
dependencies without preparing the archive. The initial correction passed 23 focused checks. The mirror-list correction
passes 25 focused checks, including the reproducing case, covering both source formats, unrelated repositories, ignored backup
files, idempotence, missing legacy files and existing workflow contracts.
Changed-code strict lint and the workflow-policy checker pass. Local checks
use synthetic temporary source files; the user's APT configuration is never
modified. No browser/package installation or full test matrix runs locally.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/ci-browser-apt.test.js js/tests/ci-contracts.test.js js/tests/ci-action-warnings.test.js js/tests/ci-cache-policy.test.js
NODE_OPTIONS=--max-old-space-size=384 node js/scripts/check-ci-workflows.mjs
```

The [evidence archive](data/browser-apt.tar.gz) and
[verified manifest](data/browser-apt.tar.sha256.json) contain both complete
failure logs, the passing-but-unmodified hosted log, pinned runner source, run timestamps/SHAs, focused results and source hashes. Job
deadlines, browser coverage and failure gates are unchanged. Exact new-head
hosted CI must still verify the setup improvement and all browser assertions;
this study does not claim that pending checks pass.

## Hosted mirror-list correction confirmed

The replacement [Pages run 42822720570](https://github.com/link-foundation/meta-sovereign/actions/runs/42822720570), created at 2026-11-10 13:14:33 UTC for `4ed3f9c58c31e7f0495b3df8882ab6a01c7da610`, passes. Its complete preserved log reports one updated source at line 246, retains the mirror-list indirection at line 259, reads primary HTTPS archive indexes at lines 263–266 and downloads actual packages from that archive from line 460 onward. Line 645 reports 139 MB in 37 seconds. Unlike the earlier passing run, this directly verifies that the hosted configuration changed. It does not remove the need to check later application assertions and the exact current-head matrix.
