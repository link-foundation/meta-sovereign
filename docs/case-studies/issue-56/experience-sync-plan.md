# HH and LinkedIn experience workflow

HH21 remains unfinished. The pinned reference is
[`experience-sync.md`](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/docs/requirements/experience-sync.md),
read in full before implementation. Its remaining behavior must be implemented
through CLI, default text/binary Lino and shared localized UI. Existing CV
field diffs key positions by company/title/start; that cannot pair translated
roles or Cyrillic/Latin company names. LinkedIn's existing reader also omits
position descriptions, skills and media. Its platform plan has no experience
writer. Generic CV sync therefore does not establish this requirement.

- [x] Add bounded company/time matching, explicit ambiguity, per-field and
      one-sided differences, preserving exact original records and metadata.
      Exercise multiple positions, reused employers, missing dates and language
      differences without inventing equivalence or deleting target-only jobs.
      Evidence: [experience comparison](experience-comparison.md), nine focused
      checks, 53 existing CV checks, four locale checks and real-browser/MCP
      comparison screenshots. This implements comparison only; HH21 stays open.
- [ ] Add complete structured HH/LinkedIn exports, per-position skills/media,
      grouped roles, private raw parsing evidence and round-trip import. Reuse
      acknowledged HH exports; refresh only explicitly or when absent. Keep
      LinkedIn in a separate visible persistent slot, with cancellable manual login
      and bounded traversal of load-more results.
      Partial export/import evidence: [private structured documents](experience-documents.md)
      preserves complete supplied records, reuses verified HH exports and adds CLI,
      both Lino encodings and four-language browser import/download/comparison.
      The live LinkedIn reader, missing-export refresh and complete native metadata
      acquisition remain unfinished; this checkbox stays open.
- [ ] Connect existing three-provider translation comparison/cache to directed
      experience planning. Retain side-by-side outputs, invalid-output refusal,
      selected-language direction and reviewed upstream failure reporting.
- [ ] Plan both directions, preserving target-only positions and unsupported
      fields as explicit review notes. Match industries by IDs and preserve city,
      website paths, dates, narratives and all native metadata.
- [ ] Prepare one exact reviewed change at a time in an independent browser
      slot, preserving existing owner drafts and unrelated application/chat slots.
      Support additions and updates, literal skill selection and existing-profile
      skill limits, plus exact website media selection without duplicates.
- [ ] Require a separate explicit Save for every change. Support Skip, leave
      draft, closed stdin and Stop. Observe owner saves separately from navigation,
      verify fresh saved exports, retain uncertainty and never replay a provider
      mutation during status/recovery. Do not automate invitations.
- [ ] Carry export/import, comparison, directed plan and review controls through
      CLI, both Lino encodings and all four localized UI languages. Preserve
      unsaved owner input and accurate capability states.
- [ ] Retain parent-failing regressions, focused core/API checks, native browser
      and independent MCP before/after evidence. Inspect hosted checks for the
      exact published source. Complete HH21 only after every item is verified in
      [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

The [native LinkedIn reader](linkedin-experience.md) now drafts bounded acquisition,
private evidence, durable recovery and shared controls with synthetic browser checks.
The [HeadHunter workplace handoff](experience-hh-workplace-review.md) prepares
one explicitly approved workplace from a completed directed plan. The CLI and
both Lino encodings stage the same exact review. Chromium verifies the shared
CV review, native preparation and an explicit owner Save with fresh synthetic
exports. Interactive queue decisions remain required.
The [LinkedIn position review](experience-linkedin-position-review.md) binds
one Add or update to the acknowledged native export and a separate approval.
The CLI and both Lino encodings can recover the exact private review. The
native preparation adapter rechecks the visible form and preserves owner
drafts. A single position can be saved or skipped explicitly through CLI or
Lino. Chromium covers owner Save with fresh readback, stale readback, Skip,
Stop and navigation. The shared CV view shows the proposed fields, asks for
separate approval and recovers the exact job after a lost Start reply or phone
reload. Native skill and media selection and an interactive queue remain
required in this direction.
Authenticated provider verification, complete HH/About acquisition and every
remaining item above stay required; HH21 remains unfinished.
