# Questionnaire criterion audit

This audit maps QA09 and QA10 to their complete pinned requirements in
`konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`, README lines
843–853. The original `knownReply` prefers a whole-question match and marks
combined answers for review; the application response resolves each component's
context independently. These two bounded questionnaire criteria concern shared
parsing, reuse and indexing. The other history acquisition, orchestration,
application and CV requirements remain separately required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

No acceptance row is completed by this document. Acceptance requires the source
comparison, original behavior mapping and all five successful workflows for the
same published source. The [hosted audit plan](hosted-criteria-plan.md) retains
that gate.

## QA09: whole questionnaires and aligned individual answers

The [original list implementation](question-lists.md) preserves a whole incoming
message or form label and its reply. Numbered questions align with numbered,
bulleted or separate answer lines. Code fences, indentation, conditional
instructions and ordinary prose remain part of their question. Ambiguous,
reordered, duplicated, oversized or incomplete lists retain the whole answer
without inventing components. The parser is shared by chat learning, saved
questionnaires and form planning, with finite input and component limits.

`question-lists.test.js` and `question-lists-controls.test.js` retain the
multi-provider learning and CLI/Lino coverage, alignment guards, repeated
evidence counting and original whole-message preservation. The original
published parent lacks component learning; its failing reproduction remains in
the list archive. Later learned answers stay unapproved until owner review.

The [observed-form correction](forms-questionnaire-learning.md) fixes the later
integration gap where a submitted questionnaire learned only the whole reply.
It uses the same parser and learns the whole plus aligned components after an
actual observed answer. Five reproducing portable checks preserve evidence
identity, repeated-count stability and skipped-input accounting. Native and
independent MCP before/after evidence show three saved rules for one whole
two-part questionnaire, with one observation per answer and no automatic
approval. A read-only form plan never writes to a provider.

## QA10: reviewed reuse, independent context and existing-answer indexing

The [assembly correction](question-assembly-context.md) keeps exact whole-answer
priority. Otherwise it uses saved individual answers, including components
derived from saved whole questionnaires. Each component resolves its own salary
currency, net/gross choice and contact templates against the current selected
profile. Missing answers remain open placeholders. Frequency ordering and
evidence overlap handling remain deterministic; a derived or assembled answer
always requires review and cannot become approved exact reuse.

The [saved questionnaire index](questionnaire-index.md) derives component
proposals immediately from existing stored whole answers without rewriting
them or increasing observation counts. Its explicit offline backfill previews
without writing, acknowledges every saved proposal, retains source evidence
and requires review. CLI, text and binary Lino, and the shared four-language
Questionnaire UI expose the same operations. Index and backfill checks retain
the original missing-component and unsafe-approval reproductions.

The [native application context correction](application-answer-context.md)
carries a validated profile and frozen salary targets through single and batch
commands, both Lino encodings and the existing localized controls. A fresh read
resolves current contact values. Identity-only reload recovery does not submit
or replay an effect. The [approval correction](application-answer-approval.md)
prevents automatic writes or submissions for derived whole-answer components,
unapproved answers and conflicts; explicit owner review and submission remain
available. Both corrections retain failing actual-parent checks.

The native context scenario verifies four components, USD and RUB targets,
current email and GitHub values, four locales and phone layout. It observes
zero automatic writes/submissions and exactly one explicitly reviewed native
submission, then closes the owned browser. Three approval fixtures independently
verify the same automatic refusal and explicit submission contract. All native
provider requests are routed to isolated synthetic fixtures. The evidence does
not claim access to a personal account or live provider submission.

## Source integrity and exact-source hosted verification

The source audit streams 28 evidence archives and verifies all 1,773 entries
against their committed manifests, including these six questionnaire archives:
`question-lists`, `question-assembly-context`, `questionnaire-index`,
`forms-questionnaire-learning`, `application-answer-context` and
`application-answer-approval`. The early list archive records source hashes
instead of source bytes. The audit retrieves those exact bytes from its
published implementation commit `86eebd79`, verifies their declared hashes,
then compares them with the selected published source. The resulting unified
diff remains part of the acceptance evidence.

Later changes include durable observed-form learning, independent component
context in application review and safe matching/indexing integration. Review
their deltas against the original contracts; matching hashes or a passing old
test log alone do not establish current behavior.

The acceptance collector requires positive named portable receipts from the
published source, plus Chromium and WebKit receipts for the saved index, form
planning, observed-form learning and both native application scenarios. It
checks their semantic counters and review/refusal states, in addition to each
group's successful completion. All eight browser shards are preserved alongside
the native Electron and resolved CodeQL logs required by the other audited
criteria. The separate [turn and policy audit](question-turn-policy-audit.md)
adds QA16 and QA26. Any failed workflow leaves all fourteen candidates pending.
