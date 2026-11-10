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

## Change and verification

`js/scripts/prepare-browser-apt.mjs` changes only complete Azure Ubuntu archive
URLs in active `.list` and `.sources` files. It preserves suites, components,
signature keys, security sources and other repositories. Missing legacy files
are harmless, repeat execution changes nothing, and other filesystem errors
fail setup. All three Linux browser dependency installs run preparation before
Playwright. The macOS lane skips it.

The workflow regression fails before the change because Pages installs
dependencies without preparing the archive. Twenty-three focused checks now
pass, covering both source formats, unrelated repositories, ignored backup
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
failure logs, run timestamps/SHAs, focused results and source hashes. Job
deadlines, browser coverage and failure gates are unchanged. Exact new-head
hosted CI must still verify the setup improvement and all browser assertions;
this study does not claim that pending checks pass.
