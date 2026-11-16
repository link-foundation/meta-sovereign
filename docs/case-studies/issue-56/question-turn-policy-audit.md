# Reminder identity and rejected-answer audit

This maps QA16 and QA26 to their complete original contracts at
`konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`: README lines
816–825 and `docs/requirements/forms-and-chats.md` lines 99–105. The original
scope includes conservative question identity, explicit owner corrections and
private rejected-answer policy. Historical acquisition and general extraction
remain separate requirements in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
Neither criterion is accepted by this document. Both require the original
behavior mapping, reviewed source differences and the successful exact-source
[five-workflow gate](hosted-criteria-plan.md).

## QA16: reminders, technical questions and requests for detail

The [turn correction](question-turns.md) retains the original question while
removing only recognized acknowledgement padding for matching and learning.
Salary and contact context use that question core. A substantive actual reply
after a continuation reminder belongs to the immediately preceding technical
question; brief consent belongs to the reminder. Explicit reply IDs take
precedence. Another question, a service barrier or expired history prevents
reassociation. Repeated reminders cannot extend the original 24-hour lifetime.
Standalone greetings contribute neither answer text nor observations.

An approved bare affirmative cannot answer a request for experience, examples
or an explanation. Actual binary answers and substantive negative experience
remain usable. Conservative four-language recognition has finite lengths and
turn limits; ambiguous history is not reassociated to a guessed older question.
The original incoming messages, reply identities, choices and transcripts remain
unchanged. Learning always produces unapproved proposals.

The original archive retains seven failing regressions, twelve final focused
checks, CLI/offline controls, both actual Lino encodings, production browser
assertions and independent MCP before/after evidence. Five stored provider
identifiers exercise the shared mechanism without claiming live account access.
The existing mandatory browser helper checks acknowledged exact reuse, refusal
of an insufficient affirmative and a reminder followed by a greeting and actual
technical reply.

## QA26: rejected wording and explicit corrections

The [persisted policy](question-policy.md) filters rejected token phrases before
frequency ranking, while learning and after current profile substitution.
Markdown, whitespace and a paraphrased question cannot revive the wording.
Token boundaries preserve unrelated answers such as `Node.js` when `No` is
rejected. Canonical saves cannot hide rejected content through placeholder
contraction. Transcripts and edited-message versions remain intact.

The [correction guard](question-corrections.md) applies explicit clean canonical
answers across rule IDs, including learning from older conversations and bot
summaries. Provider/chat scope, enabled state, aliases, context and current
profile values remain enforced. Approximate matching cannot suppress unrelated
history; conflicting canonical answers require review. General extraction of
clean facts from arbitrary apology prose belongs to the separate QA08 criterion.

The [concurrency correction](question-concurrency.md) rechecks a bounded
knowledge snapshot before a preview or apply. Policy edits invalidate stale
learning. A per-store writer queue preserves owner saves/deletes and concurrent
CLI rejection additions; failed writes release ownership. The automatic send
guard reads current policy again and refuses an already planned rejected answer.
Explicit owner-reviewed sends retain their existing permission contract.
Underlying storage and device replication keep their separately documented scope.

Portable policy, correction, contraction, concurrency, automation and control
checks retain actual-parent failures and cover CLI, offline controls and both
Lino encodings. Mandatory browser assertions verify policy persistence and failed
save recovery, clean canonical rules and stale-learning refusal followed by a
successful fresh retry. Their older helper format has no per-scenario JSON
envelope: the collector preserves the exact published assertions and requires
their awaited execution before the group success marker on both engines.

## Source provenance and later changes

The streaming audit now verifies 28 archives and all 1,773 manifest entries.
The correction and concurrency archives record source hashes; their exact bytes
are recovered from published commits `2aced5d3` and `ed241ef5` and checked
against those hashes. The earlier turn and policy archives contain no production
source hashes. Their published implementations, `df7c0c28` and `01f4d6c8`, supply
separate Git provenance for the core comparison. The audit explicitly records
that distinction; it does not imply those bytes were in the early archives.

All later core differences were reviewed. Case-preserving matching, context
selection, component indexing, private-link rejection, delivered-state checks,
passive notices, profile invalidation and model drafting preserve the two
contracts. Notice corrections remain separate from question corrections; an
unrelated notice cannot become the earlier technical question. Model drafts
also check rejected wording and require current-context review. The current
archive/source comparison supplements the original regressions; neither source
hashes nor old passing logs replace the exact-source hosted gate.
