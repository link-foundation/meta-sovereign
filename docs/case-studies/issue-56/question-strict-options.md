# Strict bot choices: shared pending and delivery guards

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) retains QA14 as unfinished while adding the shared choice contract needed for actual provider execution. The primary [reference requirements](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/docs/requirements/forms-and-chats.md) distinguish recruiter-bot answer buttons, generic HH starters, delayed/disabled controls and unchanged automatic drafts. The current choice-reader, resolver, focused test and browser fixture were read at that commit for behavior only. No reference implementation was copied. Recent merged reference PR search for chat returned no results.

## Root cause and reproduction

Previously `planAnswer` only constrained answers when `options.length > 0`. An empty option list therefore permitted a saved answer or a model draft even when a provider explicitly required buttons. The frozen turn omitted strict state; reviewed delivery bypassed option-text checks; the default sender used the ordinary API/browser text operation for matched options.

The [bounded before probe](../../../experiments/issue-56/question-strict-options-before.py) runs twelve checks against `19605f22`, restoring all seven production files in `finally`. **Eleven fail and one passes** before correction. The failures cover strict wait, four-language explicit instructions, choice metadata, malformed options, state changes, reviewed text, ordinary sends, latest-question scoping and CLI/Lino previews. Generic suggestions already preserve normal text and remain a compatibility check.

## Implemented contract

A single provider-independent guard validates at most 100 nonempty choice labels of at most 6,000 characters. `strictOptions: true` with no available labels means waiting: no text, no complete answer, no model request and no queued text draft. Explicit choose-one instructions infer the same state in English, Russian, Hindi and Chinese. Forms retain their explicit field mode. Available labels require exactly one normalized match and retain the exact provider spelling plus explicit selected-option intent. Duplicate or unmatched labels require review.

The frozen latest turn includes strict state and options; a strict option belongs only to the latest question. Changed strict state invalidates a reviewed draft even when label strings are unchanged. Review cannot replace a selected option with arbitrary text. Strict drafts skip typing simulation. Until actual verified button execution is implemented, the default sender refuses the required option click **before any ordinary API or browser text write**. This is an explicit unfinished delivery capability, not a successful click.

## Verification and remaining work

All twelve focused regressions pass. Combined Node checks pass **77** across strict choices, existing model/chat/question and browser-sender behavior; Deno passes **49** in the corresponding four focused files. Both text and binary Lino, CLI `.lino` configuration and the existing offline UI API preserve wait and exact label identity. Scoped lint, format, secret checks and the production web bundle are retained in the [archive](data/question-strict-options.tar.gz), with its adjacent SHA-256 manifest. This unit changes shared behavior rather than visual markup, so no UI screenshot is claimed.

The actual browser reader/click/readback, HH application frames, generic-chip DOM distinction, delayed/disabled control observation, unchanged automatic-draft cleanup, retry and live provider execution remain required. QA14 and every other unchecked issue criterion stay open; PR 57 stays draft and unmerged.
