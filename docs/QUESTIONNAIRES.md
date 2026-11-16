# Saved questionnaires

Chats, application answers and external form plans share the same saved-answer
planner. It indexes aligned numbered answers from existing whole questionnaires
whenever current knowledge is read for a plan. Numbered, bulleted or separate
questions keep their conditional follow-ups, instructions and code. Ambiguous
alignment stays whole. The complete saved reply retains priority.

An extracted component needs review, even when its original whole reply was
approved. Source/chat restrictions, explicit corrections, current salary/contact
context and missing values remain effective. Reading never writes derived rules
or sends anything. A newly assembled questionnaire also needs review.

In **Questions and saved answers → Learn from conversations**, preview saved
questionnaire components together with archived replies, then save proposals
for review. Saved wording adds zero uses; only actual outgoing archived replies
increase counts. Repeating the operation preserves approval and does not recount
the same observations. No provider history is downloaded.

The same offline operation is available through:

```sh
meta-sovereign automations answers backfill-questionnaires
meta-sovereign automations answers backfill-questionnaires --apply
```

`answers learn` includes the same backfill. Both negotiated Links Notation
encodings support `POST /api/automations/answers/backfill-questionnaires` or
`POST /api/automations/answers/learn`, with `{ apply: false }` for a read-only
preview and `{ apply: true }` to save proposals. Capacity or concurrent-knowledge
refusals leave proposals unapplied; review the refusal and run a fresh preview.
