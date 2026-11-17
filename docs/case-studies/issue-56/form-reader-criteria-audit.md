# Generic form reader acceptance mapping

This maps QA21 in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
to B13 in the pinned `konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`
requirements: a generic question reader uses referenced labels, labels, legends,
placeholders and nearby headings. B10 adds iframe access. The shared answer and
option engines are covered separately by QA22 and the accepted QA14 contract;
this mapping does not accept those broader workflows. QA21 remains pending until
the complete exact-source hosted gate and manual evidence review succeed.

## Current behavior

`forms/read-document.js` reads visible native and exposed ARIA controls without
Google/Yandex form-specific question selectors. Referenced accessible labels take
precedence over an ARIA label and explicit/implicit native labels. The reader
excludes embedded control values from native label text. Weaker placeholder,
title, legend and preceding-heading fallbacks retain their actual source.
Groups, descriptions, current values, required/disabled/read-only state and
available options remain separate. Password/file values are omitted; the reader
never clicks, fills, changes or submits a control.

`forms/inspection.js` uses browser-commander for navigation and the main document.
Connected Playwright frames supply the frame targeting that commander lacks,
including a real cross-origin child document. Document identities are rechecked
after extraction. A replaced/detached captured document refuses the snapshot.
Hidden/unavailable frames, inaccessible controls, truncation and unopened options
remain explicit partial coverage. Finite field, option, frame and scan limits
prevent an unbounded inspection from claiming completeness.

`forms/reader.js`, `cli/forms-commands.js` and `server/routes-forms.js` expose the
same operation through the library, CLI and trusted text/binary Lino API. A
transient read closes its owned browser, including refused reads, deadlines and
shutdown during launch. The shared Forms UI renders every retained row, actual
label evidence and coverage in four languages. Its download contains the actual
snapshot; explicit refusal/retry retains the entered URL and last report. Phone
layout, unavailable capability and browser ownership have native checks.

The broader automatic operation already exists in the
[multi-URL CLI and owned API](forms-automatic-prefill.md) and
[shared prefill controls](forms-automatic-controls.md). The old QA21 annotation
that one-command prefilling was still absent is superseded by those later units.
This correction does not establish authenticated provider acquisition, every
later page, contact discovery, assignment handoff or learning. QA22–QA24 retain
their full requirements.

## Reproduction and evidence review

The [original reader report](forms-reader.md) and archive preserve the actual
`4ed3f9c58` production bundle missing the Forms navigation, its failing assertion,
the subsequent malformed-pattern/implicit-label regression and independent MCP
observations. The old archive contains source hashes rather than source bytes.
The integrity audit retrieves those bytes from its published implementation
`7c18eee6`, checks their declared hashes and compares them with the selected
published source. This provenance distinction remains explicit.
The current DOM extractor, frame traversal, reader lifecycle, CLI/API routes,
UI read/recovery/report path and native assertion bodies were reviewed. The
retained broad delta also contains unrelated later integration and locale work;
archive integrity alone is not a review of every unrelated change.

The focused reader tests cover owned lifecycle, concurrency, shutdown, finite
deadlines, document replacement, partial/detached frames, trace privacy, bounded
frame/field admission, real CLI and both Lino encodings. Report tests exercise
four-language rendering and escaped untrusted form text. The collector requires
every named check and the mandatory browser-registration check in the successful
exact-source Node job.

On both hosted browser engines the awaited normal Forms reader path verifies
15 native/ARIA fields across two documents, actual label precedence/fallbacks,
descriptions, selected/disabled states, sensitive getter omission, preserved
owner whitespace, no interaction events or submissions, real report download,
explicit retry, phone fit and extraction limits. The complete assertion source
is retained alongside its successful registered group completion. This older
scenario has no JSON semantic envelope; completion does not replace reviewing
those awaited assertions. Full five-workflow success is required separately.

These fixtures establish shared accessible reading. They do not certify a live
Google/Yandex account or complete issue 56. The PR remains draft and unmerged.
