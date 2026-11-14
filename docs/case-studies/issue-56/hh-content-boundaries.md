# HH verification holds before CV and assignment content

HH’s visible `account-captcha-input` and `captchaText` markers now stop
assignment instruction collection, CV about preparation, CV editor snapshots
and controlled workplace reads before content is inspected. Blocked results
contain only unavailable/verification metadata. They cannot become assignment
model context, saved CV facts or a writable preparation baseline. Assignment
login/password/widget refusals remain conservative and omit the page title.

The workplace description path reuses the existing guarded controlled-field
reader instead of maintaining a separate late CAPTCHA check. A challenge that
appears between the editor snapshot and controlled-field recheck refuses the
preparation. Ordinary visible controls and acknowledged baselines retain their
previous behavior; owner Save, Cancel, other fields and delivery reservations
remain protected, including the existing hidden foreign Save dialog refusal.
Live visibility includes inherited hidden/collapsed styles.
Inert saved HTML also refuses recognizable native challenges; it does not
pretend to evaluate stylesheets or establish authenticated account state.

## Reproduction and evidence

Run `python3 experiments/issue-56/hh-content-before.py` against published parent
`63f9f5592a3b27765a9acbbe58e49ce312d626e0`. Twelve of 22 focused cases fail before
the fix; ten hidden-marker cases pass. The fixture permits boundary metadata
queries and poisons content queries and title access, so it checks access rather
than merely an empty returned result. The saved-record and late-gate cases are
included. The `--native` variant independently fails with “Assignment
instructions escaped HH verification.” Both probes restore the working sources
and drain their owned fixtures.

The corrected focused group passes 59 Node and 59 Deno cases, covering the new
22 regressions, ordinary assignment collection, CV preparation and exact saved
workplace identity. The finite Chromium content probe verifies both native
markers across four readers/five preparation paths, 12 holds, 18 ordinary or
hidden-marker reads, real inert workplace readback, zero sensitive getter reads
during holds and zero input/change/click/submit events. It is also included in
the existing mandatory native HH CAPTCHA scenario, which passes four locales,
phone layout and owner recovery with one confirmed entry and zero sends.
The existing focused workplace preparation browser scenario separately passes
its five original guarded editing, refusal and recovery cases after reuse of
the common reader. All browser contexts and owned servers close before the
fresh generated bundle is restored. No visual layout changes are involved.

Run `RUN_BROWSER_E2E=1 E2E_BROWSER=chromium node
experiments/issue-56/hh-content-native.mjs` for the content probe; `--workplace`
selects only the existing workplace preparation scenario. The existing
`experiments/issue-56/hh-captcha-native.mjs` verifies the integrated HH scenario.
Broad runtime/browser matrices remain in hosted CI. Scoped formatting, strict
lint, secret scanning, diff whitespace and the unchanged duplication threshold
are required before publication. The
[checksummed evidence](data/hh-content-boundaries.tar.gz) retains parent/current
source snapshots and all focused/native observations.

This continues HH01/HH06/HH07 and assignment privacy requirements in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57). It does not
complete authenticated provider parity, safe daily-limit capture/dismissal,
paced batches or any of the 81 original incomplete inventory rows. PR57 remains
draft and unmerged; every new commit requires its own hosted checks.
