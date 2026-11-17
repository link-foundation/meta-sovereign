# Offered-answer contract mapping (QA14)

QA14 remains unchecked pending current-source hosted verification. This report
maps the pinned behavior; it does not accept the whole criterion or any of the
other forty unfinished criteria in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Pinned behavior

The reference is `konard/hh-job-application-automation` at
`fa0991b8c2d0896fb3b4be6c69947f0590094b15`. The complete
[chat option planner](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/src/chat-options.mjs),
[regressions](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/tests/chat-options.test.mjs)
and README option requirements were read. The salary interval selector has its
separate complete [QA15 mapping](salary-band-criteria-audit.md); salary wording
and clarification have their [QA12 mapping](salary-context-criteria-audit.md).

| Required behavior                                                                                                                                      | Shared implementation                                                                                                                                                                       | Verification                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep bot choices strict, including a question requesting choices before its buttons mount. Do not substitute arbitrary free text.                      | `question-options.js` validates bounded options and explicit choice intent in four languages. Empty strict options stay pending.                                                            | `question-strict-options.test.js` covers all five chat sources, zero model requests/drafts, malformed input and CLI/offline/both Lino previews.                                                                                                                     |
| Select one exact approved offered label, preserving its spelling; reject multiple normalized matches.                                                  | `applyAnswerChoices` admits exactly one current label; `approvedBrowserPlan` requires complete approved evidence.                                                                           | Strict-option, browser-choice and current-question tests cover exact labels, changed options and explicit native dispatch.                                                                                                                                          |
| Recover a unique accepted answer from a completed incoming bot summary, without promoting rejected raw history or creating an approved knowledge fact. | `question-summary-choice.js` builds a bounded incoming-only summary index, excludes owner/service/pending/failed records and retains evidence IDs. Conflicts and limits hold review.        | Eleven summary-choice checks, four controls checks and three native desktop/mobile/receipt/conflict cases.                                                                                                                                                          |
| Use a unique containing salary option and respect configured targets, saved amount conflicts and currency/basis ambiguity.                             | Shared salary planner and strict browser admission; forms retain explicit review.                                                                                                           | Complete QA15 mapping and its own portable/native collector remain required. This report does not accept that separate criterion.                                                                                                                                   |
| Treat a repeated question after consecutive sent replies as rejection of the same wording. Preserve counts; allow a different candidate.               | `question-repetition.js` checks the immediately preceding incoming question and its consecutive owner replies. Archived owner identity and fresh dispatch use the same direction predicate. | Five actual-parent failures, six focused regressions, native before/after and independent MCP; the mandatory watcher now includes zero-effect repeated-answer review.                                                                                               |
| Wait for delayed controls, clear only an unchanged automatic draft and retry after the owner clears their own draft. Never clear owner edits.          | `browser-choice-controller.js` tracks page-local ownership, invalidates it on owner input and refuses effects over a draft. The watcher polls the same current document.                    | Provider-choice and watcher regressions include delayed mount, edited draft preservation, owner clear/retry and exactly one native receipt with zero text sends.                                                                                                    |
| Distinguish HH's greeting/schedule chips from answer controls; do not select stale, disabled, hidden, unrelated or ambiguous controls.                 | `browser-choice-reader.js` scopes current question, visible provider groups and unscoped Yes/No pairs; `browserChoiceSuggestions` excludes generic unbound HH groups.                       | Native provider/HH main-document and frame cases exercise actual Browser Commander actions and preserve zero API text writes.                                                                                                                                       |
| Bind native dispatch and acknowledgement to the same chat, question, recent context and owner-controlled document.                                     | Choice document identity, fresh plan revalidation, guarded outbox reservation and positive unique outgoing message receipt. Unknown effects stay uncertain.                                 | Browser choices, watch planning, concurrent delivery, frame reload/navigation and receipt cases. Cleanup releases listeners without declaring an uncertain dispatch safe to repeat.                                                                                 |
| Continue unread chats after an exact native choice and stop at an ordinary review draft; preserve a pre-existing owner draft.                          | `question-unread-answers.js` uses the same approved plan and guarded native choice. Ordinary free text is prefilled for review.                                                             | The mandatory `question-unread-choices` scenario selects one Chromium option, holds chat 9 and makes zero text sends; a second visit preserves the owner draft without navigation. WebKit reports its unsupported inactive-focus capability and makes zero effects. |
| Expose consistent inspection, explicit selection, watch/recovery and Stop through CLI, default text/binary Lino and localized UI.                      | Shared question browser service, durable review/watch records and existing CLI/routes/four-language controls.                                                                               | Browser/watch controls tests, native production UI scenarios and retained MCP evidence. Stop closes admission and drains owned work; restart does not resume a watcher silently.                                                                                    |

The supported provider descriptions and current document selectors are data in
the shared browser adapter. A generic text API cannot stand in for a requested
native option. Unsupported inactive-focus behavior is shown as unavailable;
neither an arbitrary send nor an invented success replaces it. An authenticated
provider account is not an additional acceptance requirement invented by this
audit; routed native documents verify the declared behavior and actual browser
actions, while retaining the limits of those fixtures.

## Source and hosted evidence

The selected source is `06953e31ac283d568d424935923038b3f5bc5060`.
`option-choice-evidence.json` selects thirteen implementation archives. All
839 entries and manifests verify without extraction. Ninety-nine historical
archive/source records differ across sixty files; the audit preserves those
differences rather than implying the old archives describe current bytes.
The behavior review above follows the shared planner, actual native reader,
ownership/controller, fresh dispatch, watcher and unread paths. Historical
whole-file CLI, locale and UI deltas are retained as context, rather than being
asserted to be independent new regressions.

The hosted collector requires all five workflows to complete successfully on
one source, records 88 named portable checks and requires the registered native
provider, question-control and unread-choice scenarios in both engines. It
checks exact watcher/summary/control counts and semantic effect receipts, not
only a green job or an archive hash. The original three-minute browser process
bound remains unchanged. New clear/retry, unread-choice and repeated-answer
coverage is part of those mandatory hosted entry points.

```sh
python -B experiments/issue-56/audit-hosted-criteria.py HEAD \
  --names-file experiments/issue-56/option-choice-evidence.json \
  --output-prefix option-choice-criteria
python -B experiments/issue-56/collect-option-choice-hosted.py HEAD SLUG
```

Preserve `hosted-verification-SLUG-*.json`, the successful Node log and Chromium/
WebKit partitions 2, 3 and 4 as `hosted-SLUG-TAG.log` first. The collector refuses
stale, incomplete, failed, unregistered or missing evidence. Its checked archive
retains `acceptance: false`; the contract mapping and current source review are
separate from integrity validation. Any later mapped production change requires
a refreshed comparison. Full current hosted verification remains pending.
