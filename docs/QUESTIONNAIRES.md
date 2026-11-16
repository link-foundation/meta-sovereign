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

Native application prefill and exact-answer automatic submission also require
an approved, unambiguous saved answer. Extracted, unapproved or conflicting
answers stay for owner review, even when the current field matches their wording.
The owner can fill the native form and separately confirm submission.

In **Questions and saved answers → Learn from conversations**, preview saved
questionnaire components together with archived replies, then save proposals
for review. Saved wording adds zero uses; only actual outgoing archived replies
increase counts. Repeating the operation preserves approval and does not recount
the same observations. No provider history is downloaded.

Observed form learning also keeps the whole reply and aligned individual
answers as unapproved proposals with the same observation count and evidence.
Ambiguous replies stay whole. Repeated observations are not counted twice;
the journal counts skipped input pairs separately from saved proposals.

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

## Native application context

Before starting a single application or batch in CV, choose a reusable profile
and configure salary targets in the application settings. Each questionnaire
component uses its own currency, net/gross basis and contact key. The receipt
shows the acknowledged profile and fixed targets. Every new plan reads the
current saved profile values; editing contacts does not change fixed salary
targets. A missing profile refuses planning. Assembled answers require review
and cannot trigger exact-answer automatic submission.

The single and batch application CLI commands accept `--profile-id` and
`--salary` (a Links Notation record using the shared salary configuration).
The matching single-open and batch-start API requests accept `profileId` and
`salary` in either Lino encoding. Omit both to retain existing behavior. Only
the application identity is saved in browser recovery storage.
