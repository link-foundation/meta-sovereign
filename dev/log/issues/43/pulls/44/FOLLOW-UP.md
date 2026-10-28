# Native WebKit CI follow-up (F27)

PR: https://github.com/link-foundation/meta-sovereign/pull/44

## Scope and requirements

The complete issue and all issue/PR conversation comments, inline comments, reviews and sub-issues were refreshed on 2026-10-28. There are no required sub-issues or new product requirements; the restart reports two failing contexts. The original A1–A15 requirements, template comparisons, 17 best-practice mappings, earlier reproductions and upstream reports remain in README.md and comparison/REVIEW.md. This follow-up preserves those implementations and repairs the newly observed test fault. `origin/main` at `2ca1db7` is already an ancestor of the prepared branch; no history rewrite or default-branch push is needed.

| Requirement | Implementation / evidence |
| --- | --- |
| Fix both reported failing checks without weakening release gates | Repair shared page observation; `Pipeline status` continues to require the complete native WebKit manifest |
| Find and reproduce the root cause before fixing it | Original failed workflow/artifact, five failing policy regressions, and a real owned-fixture WebKit navigation contrast |
| Apply the fix throughout affected paths | Context-level handlers cover initial, reopened and popup pages; message-history reopening uses that context; failure screenshots target all surviving pages |
| Avoid false negatives | Filter only native-shaped WebKit fetch diagnostics for the exact fixture origin; different ports/origins, other engines, malformed URLs and actual unhandled fetch rejections remain failures |
| Keep reusable experiments, optional diagnostics, and bounded validation | `experiments/issue43-webkit-navigation.mjs`; `CI_BROWSER_DEBUG=1` enables fixed-label tracing, off by default; focused tests run sequentially, full matrices run in CI |
| Research existing components and report shared defects | Reuse Playwright context/page events; exact engine defect already reported and confirmed in microsoft/playwright#43120; no duplicate issue needed |
| Preserve logs and review current SHA rather than stale green runs | Raw snapshot described below includes metadata, logs, annotations, browser/package/link diagnostic ZIPs and CRC/SHA checks |
| Preserve release prerequisites and original closing references | Existing PR body and `Fixes #43` retained; no new credential/manual prerequisite introduced |

## Timeline and causal evidence

- **19:05:29–19:33:18 UTC:** preceding source `3797a3e` passes four workflows and all 47 contexts (40 success, seven intentional skips). These results do not certify the later failed run.
- **19:39:56 UTC:** all four new workflows start on `ec432fe1eb7a77126909cbe4713ef169bfa74403`, the source reported by the restart.
- **19:53:05 UTC:** native WebKit's message-history suite fails solely on `Fetch API cannot load http: /127.0.0.1:49743/api/status?probe=1 due to access control checks.` Full Checks log line **34974**; the adjacent lines **34973–34977** identify the suite and exit 1. The verified `browser-webkit-12847680593.zip` summary records 41 suites and exactly one failure, `message-versions`.
- **19:54:59 UTC:** the terminal gate rejects the failed browser matrix (full log **74034**). This is correct aggregation, not a separate pipeline configuration defect. All other runtime, browser, desktop, Pages, Links and security checks pass.
- **Investigation:** the original page in `openChatApp` filters this engine diagnostic, but the message-history test closes it, opens an independent page and registers an unfiltered `pageerror` listener. Its final reload exposes the policy drift. On failure the helper screenshots the already-closed original page and suppresses the screenshot exception, leaving no picture in the original diagnostic ZIP.
- **Reproduction:** factoring the two existing listener policies into a fixture gives five failing behavioral cases before the fix (`local/page-errors-before.log`; extracted baseline retained). A minimal real WebKit server contrast returns 200 and zero errors without navigation, then catches `Load failed` during a deliberately held document replacement while WebKit separately emits the access-control `pageerror`. No CORS policy, external site, account or application state is involved.
- **Fix:** one context observer attaches the same narrowed policy and browser-dialog checks to every page. The message-history test reopens within that explicit context. Screenshots use still-open pages and report capture errors. Native WebKit/Playwright splits the diagnostic at the URL colon: error name `Fetch API cannot load http`, message `/127.0.0.1:PORT/...`, and `String(error)` displays `http: /...`. The filter requires that native error name, then normalizes only the observed display form before comparing exact origins. A further red/green regression (`local/genuine-error-before.log`, `local/native-shape-focused.log`) proves ordinary `Error` and `TypeError` exceptions containing the same text remain failures.

The exact timing of the historical failing fetch is not available; the navigation experiment establishes the engine mechanism and the code establishes the inconsistent listener policies. No product CORS defect or engine repair is claimed.

## Verification

- Eight behavioral regressions pass: reopened-page policy, preserved genuine errors, origin/engine boundaries, malformed URLs/unhandled rejections, browser dialogs, optional tracing, surviving-page screenshot selection and genuine exceptions matching the diagnostic text. All five cases run against the extracted old policies fail before the fix.
- The existing 14 CI contracts pass with the new eight cases (**22 tests total**).
- The real WebKit navigation experiment passes in under two seconds with the final shared policy: the engine diagnostic remains recorded separately, the handled rejection is observed, and the shared error collector remains empty.
- The complete focused message-history browser scenario passes in Chromium with the real app, temporary fixture and memory store. The full runtime/browser/native matrices are reserved for GitHub CI.
- Changed-file ESLint and Prettier pass. No product source, generated app bundle, dependency, assertion, deadline or required check is removed or relaxed.

Fresh CI on the pushed fix is recorded in the PR description after all current contexts finish. Historical green results above are not substituted for that verification.

## Primary research

- [Playwright page events](https://playwright.dev/docs/api/class-page#page-event-pageerror): `pageerror` is scoped to one page; page creation requires consistent observation.
- [Playwright context page events](https://playwright.dev/docs/api/class-browsercontext#browser-context-event-page): new pages, including popups, can share a single observer.
- [Confirmed WebKit cancellation classification](https://github.com/microsoft/playwright/issues/43120): reproduction, upstream source tracing and maintainer confirmation; no supported fixed version is asserted.
- [WebKit ThreadableLoader](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/ThreadableLoader.cpp): JavaScript-source diagnostics can be emitted separately from handled request rejection. The existing upstream report proposes preserving cancellation provenance in the loader instead of classifying it as access control.

Raw upstream issue and all comments are included in the follow-up snapshot. The observed split `Error.name`/`Error.message` and real fetch reproduction are retained so a future upstream report can distinguish the engine diagnostic from a genuine unhandled application error.

## Raw evidence snapshot

`recheck-20261028.tar.gz` contains `recheck-20261028/` with fresh issue/PR feedback, run metadata, complete logs from all four failed-head workflows, commit-wide checks and annotations, every available small diagnostic artifact, and focused before/after validation logs. Its adjacent `.sha256` verifies the archive. Restore with:

```sh
cd dev/log/issues/43/pulls/44
sha256sum -c recheck-20261028.tar.gz.sha256
tar -xzf recheck-20261028.tar.gz
```

The snapshot has a deliberate pre-push cutoff. Final-head CI diagnostics are collected locally after completion and linked from the PR; committing logs of a commit's own future run would create another source revision and another required CI run. Original evidence volumes remain unchanged and restorable with the existing verification tool.
