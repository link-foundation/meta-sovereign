# Desktop landing asset availability

The published parent `745766488c2c1c6e1773546d9d0a4175a8b28aa0`
accepts matching release asset names without checking upload state or size.
GitHub documents that a failed upload can leave an empty `starter` asset
in its [release asset API](https://docs.github.com/en/rest/releases/assets).
The parent offers that unfinished asset as an installer and selects a
release containing only unfinished uploads over a previous usable release.
Its session cache also drops the upload state.

Release selection, installer links and checksum/provenance links now share
one availability check: uploaded state, positive integral size and an actual
repository release download URL. Selection requires a versioned release
with at least one of the 14 catalogued installer names. Other completed
platforms remain available in a partial release. The primary action reads
“All releases” when its platform asset is absent. The cache retains state
and refreshes legacy entries without it. API failure still offers the
release page and local-server instructions.

## Reproduction and verification

- `python3 -B experiments/issue-56/desktop-landing-before.py` runs the three
  new catalogue/cache regressions against the exact published parent and
  restores the current source. All three fail before the fix.
- Focused Node checks: 36 pass across catalogue, page, new availability and
  hosted-browser registration contracts. Focused Deno: 31 pass across the
  three download test files. No full local suite runs.
- One native Chromium scenario verifies the disabled unfinished installer,
  13 available alternatives, four locales at phone width, cached reload,
  previous-release selection and the HTTP 403 fallback. The before scenario
  records the parent offering the unfinished Windows installer. Owned static
  fixtures and contexts close; no application server or installer is used.
  Run with `RUN_BROWSER_E2E=1 node experiments/issue-56/desktop-landing-browser.mjs`
  using an installed Playwright browser (or `E2E_EXECUTABLE_PATH`).
- Independent Playwright MCP confirms disabled links, accurate primary and
  metadata fallbacks, four-language phone fit and cached reload. Its browser
  and owned static server close. The phone screenshot follows a reload, so
  it returns to the detected Linux platform while retaining the disabled
  Windows row.
- A metadata-only audit reads all 76 public releases and finds current
  `v1.2.0` with all 14 expected uploaded installers, checksum and provenance
  URLs. The saved API response and audit are retained; no binary downloads
  occur. The unfinished-upload fixture represents GitHub's documented
  failure mode, not an assertion that this public release is incomplete.
- Scoped strict lint, formatting, secret scanning and diff checks pass.
  Duplication is 6.48% under the unchanged 6.5% gate. The new one-scenario
  browser entry is mandatory in the existing hosted Chromium/WebKit shards;
  no matrix, assertion or deadline is removed.

## Evidence and remaining work

The [checked archive](data/desktop-landing-availability.tar.gz) and
[per-file hashes](data/desktop-landing-availability.tar.sha256.json) retain
source, parent source, focused logs, live metadata, independent receipts
and screenshot hashes. Screenshots live in
[`docs/screenshots/issue-56-desktop-landing`](../../screenshots/issue-56-desktop-landing).
The same archive preserves exact-parent CI failures and the bounded
[canonical-path fixture correction](ci-cv-publication-alias.md), including
the previous capability expectation failure and complete workflow log.

VD10's local and public-metadata evidence is complete; exact-head hosted
checks remain required before marking its inventory row complete. Every
other unfinished issue criterion remains required. PR #57 remains draft.
