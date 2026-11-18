# Question recognition and summary acceptance audit

QA01 and QA07 map to the original common question behavior in
`konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`: README lines
816–824 and `docs/requirements/forms-and-chats.md` lines 107–115. The reference
explicitly includes informal requests without question marks, a bot's changing
acknowledgment before its question, and factual recruiter summaries that need
no reply. This document adds two candidates to the
[exact-source hosted audit](hosted-criteria-plan.md); it accepts neither row.

## QA01: shared recognition and question identity

The [language correction](question-language.md) unifies CRM and automation
recognition for English, Russian, Hindi and Chinese. Explicit question marks,
unmarked interrogatives, factual imperatives, delimited acknowledgments and
sentence boundaries use the same finite recognizer. Announcements, thanks,
lookalike words and empty or oversized input retain negative regressions.
Unicode marks and internal joiners remain meaningful; normalized equivalent
spellings match without conflating Hindi vowel signs, currencies, language
names or contact addresses. Template gaps cannot absorb another question.

The [turn implementation](question-turns.md) removes only recognized padding
when the remainder still asks a question. Both matching and learning retain
that core; context inference cannot mistake thanks for salary information for
a new salary question when the actual question asks for GitHub. Original
messages, explicit replies and native choices remain intact.

Eight portable language tests cover four-language recognition, five stored
provider identifiers, shared planning/learning, numbered questions, negative
examples and owner-question barriers. CLI, offline controls and both actual
Lino encodings preserve Hindi/Chinese exact previews. Mandatory browser
assertions save and preview Hindi/Chinese rules, reject a vowel-sign mismatch
and verify actual outgoing-turn counts without applying a preview. Independent
MCP evidence shows zero proposals before the fix and two afterwards, with no
provider sends. The original archive retains six failing regressions.

Recognition remains a conservative finite heuristic, rather than a claim to
understand arbitrary natural language. The separate history acquisition,
native form navigation, unread orchestration and delivery criteria remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
Those workflows are not prerequisites invented for a stored-text recognizer,
nor are they completed by its five-provider fixture identifiers.

## QA07: summary facts without invented observations or replies

The [summary parser](question-summary.md) accepts the actual HH handover
header, preceding answer labels and empty employer-question footer. Explicit
labels work in all four languages. Unmarked handovers need multiple complete
pairs and a recognizable question. Fenced code and blank lines are preserved;
unfinished fences, unknown appended tasks and excess pairs cannot suppress a
reply as if the whole message were a completed summary.

Shared learning retains each factual pair with the summary message ID,
count zero and approval false. Repeated learning across five stored provider
identifiers does not invent outgoing sends or mutate transcripts. Rejected
facts, private access URLs and quoted counterquestions remain excluded.
Planning a completed summary produces an empty no-reply result; field mode
and messages with appended tasks retain their separate handling.

Seven parser and two control tests retain the actual-parent failures and
CLI/offline/text-binary Lino coverage. The mandatory native browser helper
previews and saves the actual HH summary, then reads back zero-count,
unapproved facts with their provenance. Independent before/after and phone
screenshots remain in the original case study. Current shared correction,
privacy, delivery and accepted-choice integrations preserve the parser's
facts/observations distinction. A summary never approves free-text sending.

## Source and hosted evidence

The streaming audit verifies both original manifests. The early language
archive has no production hashes, so its source comparison uses explicitly
separate Git provenance at `23726697`. It does not claim those source bytes
were archived. Summary source hashes are recovered from `dfa1f68d` and checked
against the archive's declared hashes. Its layout and parser implementation remain
unchanged; the added completed-pair export and later learning/planning
integrations preserve the distinction between complete summaries and proposals.

The collector requires all four named portable files on the audited SHA and
preserves both exact mandatory browser helper bodies. The published entry
must await each helper before the successful question-group marker on both
Chromium and WebKit. These older assertions have no semantic JSON envelope;
the receipt accurately identifies group completion. All five workflows must
also pass on that same SHA. Historical failures and broader unfinished work
remain visible after any individual acceptance decision.
