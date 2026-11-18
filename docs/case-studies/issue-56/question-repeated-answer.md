# Repeated questions hold rejected wording

The pinned Chat Reference `answerWasRepeated` rule requires manual review when
the latest incoming question repeats the immediately preceding incoming
question after the same wording was sent. Previously, an approved “Yes” was
selected automatically again. The read-only planner now retains that proposed
answer and its count but requires review. A different accepted summary option
remains usable. Form fields and unrelated incoming turns retain their behavior.

Archived planning and final dispatch use the same owner identity predicate as
turn selection, including `out`, `outgoing`, `me` and configured sender IDs.
The watcher and unread planner inherit the shared guard. Its optional diagnostic
records only the reply count and remains off by default.

Reproduce with one incoming experience question, one delivered outgoing “Yes”,
and the same incoming question again. Save an approved matching answer, inspect
the current native Yes/No controls and start the watcher. The published parent
`9636107f` selects Yes again; the corrected watcher pauses for review without
clicking, sending or changing the provider draft.

Five of six focused checks fail against the actual parent. All six pass in
Node and Deno after correction; 26 focused repetition, accepted-summary and
employer-context compatibility checks pass in Node. These include fresh
dispatch refusal, all five providers' archived identities and unchanged counts.
The existing hosted question-controls scenario now includes this native case.
Both native browser comparisons pass, and independent Playwright MCP review
confirms zero choices/sends, an empty retained draft and drained resources.
MCP console diagnostics include a favicon 404 and a cache-write warning; this
is not a clean-console claim. Scoped lint retains one existing complexity
warning in context normalization, with no errors.

The [before](../../screenshots/issue-56-question-watch/after/repeated-question-before.png)
and [after](../../screenshots/issue-56-question-watch/after/repeated-question-after.png)
screenshots show the actual production interface over an isolated native
provider DOM. No live account or production messages were used.

The checked [archive](data/question-repeated-answer.tar.gz) and
[manifest](data/question-repeated-answer.tar.sha256.json) retain raw checks,
parent/current sources and all three screenshots. Full QA14 parity and
exact-head hosted verification remain unfinished in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
