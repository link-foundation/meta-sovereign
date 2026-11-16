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

## Final-period preference

In **Questions and saved answers → Answer reuse policy**, choose **With a final
period** (the default) or **Without a final period** and save. When both `Vietnam`
and `Vietnam.` were observed for the same question and approval/correction state,
reuse combines their actual counts and evidence and chooses the configured
spelling. A lone spelling remains exact. Other punctuation, case, different
questions and different approval states remain separate. Original answer records
and transcripts are preserved, so repeated learning does not recount replies.

Counts include independently saved rules that match this exact question and pass
the current provider/chat restrictions. Template and approximate matches keep
their own rule boundaries. Overlapping observation evidence requires review
under either punctuation policy; it is never silently counted twice.

The separate broad punctuation-equivalence option retains its existing behavior:
when enabled, it takes precedence and keeps the most frequent original spelling.
The final-period selector is disabled while that option is enabled. A failed save
retains the pending selection and shows the failure; it does not confirm a change.

Persist the shared preference through the CLI:

```sh
meta-sovereign automations answers policy --answer-final-period=without
```

`answers plan`, `answers browser inspect`, `answers browser unread`, and
`automations plan` / `automations run` resolve `--answer-final-period=with|without`,
`ANSWER_FINAL_PERIOD`, or `ANSWER_FINAL_PERIOD: "without"` in `.lenv`.
`--configuration=path.lenv` selects another configuration file. Precedence is the
explicit flag, environment, selected file, working-directory `.lenv`, saved
answer action, saved policy, then `with`. These overrides change neither the
process environment nor saved policy/action. A browser review retains its
resolved preference through watch and unread revalidation. Ordinary automation
runs carry it through confirmed delivery checks; pending edited drafts remain
under their existing review rules. Planning starts no provider automation.

Both Lino encodings accept `POST /api/automations/answers/policy` with
`{ policy: { answerFinalPeriod: 'without' } }`; planning accepts
`answerFinalPeriod` as a read-only override. Invalid values are refused without
changing policy. The offline interface uses the same planner and saved preference.

`forms-plan` and `forms-review` (including `--prefill` and interactive
`plan`/`prefill`) resolve the same flag, environment and Lino-file settings.
Form plans retain the explicit spelling through final knowledge checks. The
standalone `/api/forms/plan` and session `plan`/`prefill` routes accept
`answerFinalPeriod` in either Lino encoding. A recovered prefill request must
retain its original preference; a changed preference needs a new request.
Invalid preferences refuse before provider inspection or writes. Existing
owner content, explicit form review and manual submission rules still apply.

## Preferred answer wording

For each saved answer, **Equivalent answer wordings, one per line** lists exact
observed spellings that should use the answer above. This is an explicit preference
for that question, including its saved equivalent questions and provider/chat
scope. It never guesses paraphrases. For example, two observed replies saying
“One or two weeks after an offer.” and three saying “After an offer, in 1–2 weeks.”
can use “Within one to two weeks of an offer.” with five observed uses. A manual
preferred answer starts at zero uses. Other commitments, such as “In a month.”,
and answers to unrelated questions stay separate.

Approval belongs to the preferred answer. An unapproved preference still needs
review. Declaring equivalent wording does not send a reply. Conflicting preferences
or overlapping observation evidence require review and are not silently summed.
Original answer records and messages stay unchanged; repeated learning keeps the
same actual counts. Rejected phrases remain excluded. Choices remain literal.

The shared online/offline editor confirms a save only after acknowledgement;
a failed save retains the draft. Reload reads current saved wording. Remove all
lines to clear a preference. CLI `answers save` accepts one literal
`--equivalent-answer=<text>`. For several spellings, save an answer rule in a Lino
or JSON file with `equivalents: [text, text]` on the preferred answer, then run
`meta-sovereign automations answers save preference.lino`. Re-saving the file
reads its edits; omitting `equivalents` clears them. Both Lino API encodings retain
the same answer field. No preference file or aliases means no wording replacement.

## Work-start timing answers

For an explicit question about when you can start work, shared planning and
learning exclude a reply with no recognized time or timing condition, even if
it has a high historical count. This narrow English/Russian/Hindi/Chinese guard
also accepts numeric dates and preserves different commitments. A closed timing
question can still use yes/no; ordinary office consent and unrelated project or
metrics questions stay unchanged. This is a bounded wording check, not general
semantic validation. Original saved answers and transcripts remain inspectable
and unchanged; a missing usable answer stays unanswered for review.
