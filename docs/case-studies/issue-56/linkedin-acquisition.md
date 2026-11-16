# LinkedIn card text and About acquisition

This unit continues the original HH/LinkedIn workflow in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57). HH21 and all
60 incomplete inventory rows remain required. It extends acquisition without
claiming native edits, owner-Save verification or authenticated live acceptance.

## Behavior and boundaries

The reader accepts both recognized entity markup and bounded text within
observed experience cards. Grouped roles require their own dated list item;
dateless skills and media fragments never become jobs. Text fallback retains
original card text, dates, descriptions, observed skill labels and full media
URLs. Ambiguous headers, multiple date ranges, oversized records and unknown
boundaries refuse the export. It does not split arbitrary whole-page prose into
invented jobs. Location recognition is conservative; narrative with commas stays
in the description.

A single separately owned temporary tab reads About on the exact selected
profile. Only the rendered About section may expand. The experience page still
loads once. Repeated stable observations establish completion; missing sections
remain explicitly unobserved and cannot authorize an empty replacement. The
profile identity, observation boundary and pass count are validated again while
building the canonical document. DOMContentLoaded alone does not establish that
profile content has rendered, so the existing bounded traversal waits for main
content. Login walls, changed identities, multiple About sections, owner drafts,
unfinished traversal and Stop refuse completion.

The temporary tab closes before detaching unless the owner has opened an editor
there. An owner draft stays open and no form values are read. A late tab creation
must drain on Stop. Original raw evidence and both Links Notation formats remain
private hashed artifacts. All existing request recovery, CLI and Lino surfaces
use the same reader; no provider writes are introduced. Optional phase-only
tracing stays off unless `MS_CV_LINKEDIN_DEBUG=1`.

The pinned experience-sync reference in the inventory informed the fallback
requirement. Its behavior was studied without copying its implementation.
Recognized observed card boundaries are required; arbitrary changed markup
remains a refusal rather than a fabricated successful export.

## Reproduction and verification

On published commit `8cbe939c`, the new fallback-card regression refuses the
unparsed card and the About regression receives no biography. The bounded parent
probe saves that failure and restores the working files in `finally`.

`cv-linkedin-acquisition.test.js` adds ten focused regressions covering fallback
and grouped jobs, original fields and both Lino round trips, ambiguity, About
artifacts, unobserved absence, session/markup refusal, draft ownership, delayed
main content, metadata validation and late Stop draining. Together with the
existing reader and CLI/API/controller tests, 27 focused checks pass locally.

`linkedin-acquisition-native.mjs` uses actual Chromium and browser-commander with
synthetic routed pages: entity and fallback layouts each produce three dated
jobs from one experience load and one profile load. Native About guards verify
expansion, duplicate-section refusal and credential-wall refusal. These checks
are included in the existing mandatory LinkedIn browser scenario.

The prior Windows/Bun HTTP fixture failure is preserved at
`ci-logs/checks-43853402642-bun-windows.log:2658–2682`. Its 100 one-millisecond
polls exhausted while the export still acknowledged private files. Polling now
uses a bounded elapsed-time window within the unchanged ten-second test deadline,
checks terminal failure states, and avoids a platform-dependent I/O count.

Strict lint, formatting, secret checks, SPA build and the unchanged duplication
gate pass locally. The evidence archive retains source hashes, parent failures,
focused/native results and the relevant hosted failure. Hosted acceptance for
the final commit is still required; no authenticated account was available for
live validation in this fixture.
