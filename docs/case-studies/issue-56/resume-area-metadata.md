# HH area metadata through saved exports

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) now shares
native resume conversion between downloaded exports and independent post-Save
readback. The previous converter retained a city label but did not resolve or
serialize its official HH area ID; its sanitizer also discarded supplied IDs.
That made a translated city label insufficient to verify the saved region.

The shared conversion reads complete official localized area and industry
directories, reusing their existing one-day store caches. Area reads omit account
credentials, refuse redirects, bound response bytes and tree traversal, and honor
cancellation. A city label must identify exactly one official ID. Names shared
by different regions refuse conversion; no region is guessed.

New exports retain `area` and `areaId`, full industry IDs and localized labels,
the complete archived website path, descriptions, About and technology lists.
The ID survives JSON, Links Notation, derived text and Markdown, immutable HH
experience reuse, and verified owner-save snapshots. Existing documents without
`areaId` retain their previous shape and remain readable. An absent field does
not authorize clearing native metadata.

Independent saved readback resolves the editor's locale separately from the
export's locale. A verified ID can confirm `London` and `Лондон` as the same
region; another ID or ambiguous label cannot confirm it. Exact activity IDs,
record membership and the other existing Save checks remain required. Native
preparation refuses an imported ID that conflicts with the dictionary mapping.
Status reads never start exports, and no Save or provider write is added.

Reproduce the parent failure with:

```sh
python -B experiments/issue-56/resume-area-before.py
```

It temporarily loads the published `68bb9f09` sanitizer, runs the new area
round-trip regression, requires its missing-ID failure, and restores the drafted
bytes in `finally`.

The focused regression file is `js/tests/resume-area-metadata.test.js`. It covers
legacy and new documents, invalid IDs, full finite dictionaries, cache expiry,
cancellation, bilingual conversion, preserved native metadata, independent saved
readback, localized verification, ambiguous regions and preparation conflicts.
The existing native resume-export and owner-Save browser checks now assert the
area ID in actual derived files and acknowledged saved snapshots. Their isolated
fixture accounts do not use or mutate a real provider account.

Run these browser cases with:

```sh
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/usr/bin/google-chrome \
  NODE_OPTIONS=--max-old-space-size=384 \
  node experiments/issue-56/resume-area-browser.mjs
```

The focused group passes 34 cases; the compatibility group passes 43, with
overlap between these groups. All ten isolated Chromium cases pass, including
unchanged export download counts, provider-click restrictions and retained
snapshots on metadata/membership mismatches. Strict lint, formatting, SPA build,
secret scanning and `git diff --check` pass. Duplication remains within the
unchanged 6.5% gate at 6.49% (51,098 / 786,834 tokens).

The [unit checklist](resume-area-plan.md),
[evidence archive](data/resume-area-metadata.tar.gz) and
[entry hashes](data/resume-area-metadata.tar.sha256.json) preserve the source
snapshots and local checks. Hosted exact-head acceptance is pending.
Authenticated acquisition, hidden/new native records and the remaining
experience synchronization requirements are still unfinished. HH18 and HH21
remain unchecked; this data conversion does not complete issue #56.
