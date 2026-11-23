# Prepare a HeadHunter workplace review from an experience plan

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
encodings, CLI parity, and refusal to reopen after a newer native Save. The
suite uses owned export and browser fixtures. Authenticated provider testing,
LinkedIn native editing, and interactive queue controls remain open.
