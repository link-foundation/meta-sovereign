# Prepare a HeadHunter workplace review from an experience plan

In the CV view, open **Experience documents** and choose the acknowledged
HeadHunter export and the LinkedIn snapshot. Build the LinkedIn → HH plan.
Open a workplace change, enter the existing HeadHunter ID for an update, and
choose **Create workplace draft**. **Open workplace review** moves focus to the
new draft. Review the field changes and the fields that need separate owner
attention. Approval enables native preparation in the export's browser slot.
The approved review reopens after a reload in the current browser tab.

[Comparison before the handoff](../../screenshots/issue-56-experience-hh-workplace/before.png) ·
[Draft action in the comparison](../../screenshots/issue-56-experience-hh-workplace/after.png) ·
[Approved review at phone width](../../screenshots/issue-56-experience-hh-workplace/review-phone.png)

## CLI

Use a completed LinkedIn → HeadHunter comparison whose HeadHunter input was
created from an acknowledged native export. Take `requestId` and the top-level
`fingerprint` from `cv-experience-plan-status`. Choose the zero-based index in
`plan.jobs`. For an update, take the numeric workplace ID from the existing
HeadHunter form. An addition needs only the index.

```sh
meta-sovereign vacancies-cv-workplace-plan \
  --experience-request-id="$request_id" \
  --experience-fingerprint="$experience_fingerprint" \
  --experience-job-index="$plan_index" \
  --record-id="$record_id"
```

The draft uses the HeadHunter export's browser slot, and an explicit slot must
agree with that export. Keep the returned workplace fingerprint to recover the
exact draft with `vacancies-cv-workplace-plan-stored`. Review the before and
after values, then pass that fingerprint to `vacancies-cv-workplace-review`.
Use the fingerprint from the approval for `vacancies-cv-prepare` with
`--review-kind=workplace`. Use `--operation=add` for an addition. The owner saves
in HeadHunter. The separate Save watcher verifies the native result and CV
membership from fresh exports.

The handoff checks the artifact bytes and the original record. A newer export
or a verified native Save that changed the target workplaces requires a fresh
comparison. HeadHunter city labels must resolve to one official bilingual area
ID. LinkedIn skills, media, and unresolved cities remain visible in the
experience plan. An update with only unavailable fields produces a note and
opens no form. Website and industries on existing workplaces stay intact.

`cv-workplace-experience.test.js` covers the matched edit, target-only Add,
receipt reuse, separate approval, scope and fingerprint refusals, both Lino
encodings, CLI parity, and refusal to reopen after a newer native Save.
`e2e-cv-workplace-experience.mjs` exercises the production CV surface and a
controlled HeadHunter-shaped browser form. It restores the exact approval at
phone width, prepares only record 123 without a Save, then verifies the owner's
Save and unrelated résumé preservation with fresh synthetic exports. Playwright
MCP independently checked focus, reload and width and captured the views above.
The browser regression drops the first draft response and verifies that a new
request is issued only after a second explicit click.
Authenticated provider testing, LinkedIn native editing and interactive queue
controls remain open.
