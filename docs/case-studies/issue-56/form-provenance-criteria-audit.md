# Field provenance acceptance mapping

This maps QA25 in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
to the pinned `konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`
README, line 682: every question, its source and answer are printed and saved
to `logs/forms/`. The inventory requires exact, approximate, profile, model and
unresolved answers to remain distinguishable. Acceptance is pending the complete
five-workflow gate for the published source selected by the collector.

The original report requirement is distinct from acquiring every provider's
forms, navigating every page or submitting applications. Those criteria retain
their full separate scope. The fixtures below establish the shared reporting
behavior; they do not establish a live model account or authenticated provider run.

## Current behavior

- `forms/answer-plan.js` retains every inspected field and its current value.
  Its provenance projection identifies exact or approximate saved rules, their
  original question variants, evidence and similarity. Profile proposals name
  the keys and resolved revision; they do not invent a similarity score.
  Protected controls, missing facts, incompatible choices and exhausted matching
  work remain visible with an unresolved reason.
- `forms/model-drafts.js` preserves deterministic proposals and labels generated
  text `model`, with provider/configuration revision and supplied evidence.
  Missing facts remain visible clarification drafts without writable proposals.
  Apply validates the frozen context without a second model request.
- `web/forms-answer.js` renders source, proposed value, evidence, actual matched
  questions, similarity, profile keys and unresolved reasons through the shared
  four-language controls. Current values remain separate from proposals.
- `forms/review-journal.js` carries the reviewed source onto matching returned
  fields after an action. Unavailable readback is explicitly the last reviewed
  snapshot. Historical reports contain no session/plan authority; bounded count
  and byte omissions are disclosed. Reading or downloading them does not fill
  controls or repeat an action.
- `forms/report-markdown.js` exports every retained field, its label/group,
  observed value, proposed answer/source, evidence, saved questions, profile
  revision and outcome. It escapes untrusted form text. JSON retains the same
  structured report. `forms/report-file.js` flushes uniquely named private files
  under `logs/forms/`; a failed write stays separate from a confirmed browser
  result and never overwrites an existing report.
- `forms-read`, `forms-plan` and `forms-review` print their actual reports and
  support JSON/Markdown. Server read/plan/review operations use the same report
  writer. The shared UI downloads current reports and captured checkpoints in
  both formats. Trusted text and binary Lino routes retain the same provenance.

## Reproduction and verification

[Answer planning](forms-answer-plan.md) preserves the missing-control failure
against `946e4f87` and two short-label regressions. The archived independent
browser receipt shows nine proposals, six unresolved fields, eleven preserved
values and the actual profile source at desktop and phone widths.
[Reviewed prefilling](forms-reviewed-prefill.md) retains selected field receipts
and recovered outcomes separately from source proposals.
[Captured reports](forms-review-journal.md) preserves the actual-parent missing
`historyReview` failure and missing browser history control. Its native scenario
checks the saved Markdown against the real action result, both downloads, four
captured checkpoints and no historical fill authority or submissions.
[Model drafting](forms-model-drafts.md) retains the zero-versus-one model-call
failure against `60eb49c5`, the missing configuration control and an independent
MCP receipt: one generated field is read back, the owner's name remains, the
unknown date stays empty, one adapter call occurs and no form is submitted.

The integrity audit includes these four archives, recovers the first two
archives' declared source hashes from `0176fe7d` and `afaf8bed`, and compares them
with the selected published revision. The reporting, provenance, model projection,
CLI persistence and current shared call sites were reviewed. The retained broad
source diff also includes unrelated later integration changes; archive integrity
alone is not behavioral acceptance.

The collector requires all named checks in `forms-answer-plan`, `forms-report`,
`forms-markdown`, `forms-journal`, `forms-model-review`, `answer-model-drafts` and
`answer-model-api`, including CLI, both Lino encodings, private file creation,
escaping, four-language rendering and frozen-context recovery. On each browser
engine it requires the actual Forms reader completion with its mandatory plan
assertions, completed journal/model scenarios and the semantic model receipt.
Older plan/journal checks have no JSON result envelope: their published assertion
bodies and actual awaited completion are preserved explicitly. All five exact-SHA
workflows must pass before this mapping can accept QA25.
