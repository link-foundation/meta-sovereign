# Shared form prefilling acceptance mapping

This maps QA22 in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
to the pinned `konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`
B1/B4–B11/B13/B15/B25–B27 contract. QA21 covers accessible extraction;
QA23 covers isolated lifetimes and learning; QA24 covers assignment handoff.
Each retains its separate acceptance evidence. The completed
[hosted and assertion review](hosted-form-prefill-learning-997b0dd2.md)
accepts QA22 at `997b0dd2` after all five exact-source workflows pass.

## Contract and implementation

| Reference | Shared behavior and retained evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1        | `forms-review --prefill` validates the whole URL batch, then opens and prefills each owned slot sequentially. The owner can configure review capacity. The same reader operation serves the trusted API and shared Prefill control. See [automatic filling](forms-automatic-prefill.md), [controls](forms-automatic-controls.md) and [capacity](forms-review-capacity.md).                                                                                                                                                                                                                                                                             |
| B4/B4a    | Forms planning reads the selected store's private `resume/resume.md`, then `contacts.lino`, then `profile.lino`. Named and explicit profiles retain precedence. Canonical contact expansion uses current values; learned contact contraction is reviewed under QA23. Reads are bounded and source revisions invalidate stale proposals. See [private defaults](forms-private-profile.md) and [résumé extraction](resume-profile-import.md).                                                                                                                                                                                                            |
| B5        | Explicit résumé, LinkedIn and GitHub requests retain the requested destinations. Combined link requests collect the requested kinds. Missing contacts remain unresolved; saved/model yes/no wording cannot fill a link request. See [requested links](forms-link-answers.md).                                                                                                                                                                                                                                                                                                                                                                          |
| B6/B13    | `forms/answer-plan.js` calls the common `planAnswer`, matching and option engine used by chat/application answers. `proposals.js` converts the result into exact native text, one choice, checkbox sets or a validated date/number. It rejects invalid dates, ambiguous/disabled options, incomplete groups and unsupported formats. Reviewed native and exposed ARIA targets retain actual readback and replacement consent. See [planning](forms-answer-plan.md), [reviewed filling](forms-reviewed-prefill.md), [radios](forms-reviewed-radios.md), [custom controls](forms-reviewed-custom.md) and [choice disclosure](forms-reviewed-choices.md). |
| B7/B15    | Explicitly enabled model drafts receive the selected stored CV or conventional full private résumé, current profile and approved examples. Unknown personal facts remain clarification drafts. Choice outputs pass the same option validation. Plain-text normalization removes Markdown. The frozen context is revalidated without another model request during application. See [model drafts](forms-model-drafts.md), [private model context](forms-private-model.md) and [plain drafts](forms-plain-drafts.md).                                                                                                                                    |
| B8        | An eligible empty résumé field can use an explicitly supplied PDF, a saved selection or the conventional private `resume/resume.pdf`. Attachment verifies current source bytes and native SHA-256; an owner attachment is preserved without separate replacement consent. See [PDF review](forms-reviewed-upload.md), [saved selection](forms-configured-resume.md) and [private PDF](forms-private-resume.md).                                                                                                                                                                                                                                        |
| B9        | The existing automatic executor waits for the owner's challenge response in the owned browser, up to the production 30-minute bound. It neither solves nor clicks the challenge. Stop, navigation, deadline and read failures remain separate outcomes. See [challenge waiting](forms-captcha.md).                                                                                                                                                                                                                                                                                                                                                     |
| B10/B11   | Main and cross-origin documents share the same plan/apply path. Prefill retains the initial exact document/control boundary across text writes and attachment replans. It fills only the current page and reports manual Next/replan guidance; it never clicks Next or submits. The owner can run a distinct request on the next page. See [automatic filling](forms-automatic-prefill.md).                                                                                                                                                                                                                                                            |
| B25       | Explicit city and Moscow/UTC/GMT offset questions use the current configured city and time zone together. Missing values remain reviewable. See [time zones](forms-timezone.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B26/B27   | A known vacancy's lower offer and the form's own per-frame introduction supply explicit minimum guidance; the visible introduction takes precedence. The comfortable rate remains distinct, units are converted under the saved policy and the answer remains concise. These drafts do not establish approval. See [pay guidance](forms-pay-guidance.md) and [salary bands](salary-option-contract.md).                                                                                                                                                                                                                                                |

## Ownership and recovery

Automatic selection excludes existing owner values/files, incomplete proposals,
protected fields and radio effects that would clear an owner selection. Manual
replacement requires explicit permission. The writer rechecks exact documents,
controls and current knowledge, and verifies the resulting values. An uncertain
write stops later writes and uploads. Recovery returns cached receipts for the
same frozen request; conflicting or expired request identities cannot replay.

The shared UI exposes actual receipts and unresolved questions, preserves failed
recovery context and respects server capabilities. CLI and negotiated text/binary
Lino use the same owned operation and trusted local store. Request bodies cannot
choose private host paths. These are explicit form changes that a provider may
save immediately; the user still reviews and submits the form.

## Verification boundary

The [evidence catalog](../../../experiments/issue-56/form-prefill-evidence.json)
selects the original before/after archives and current-source comparisons.
The three private-source corrections retain actual-parent regressions rather
than treating earlier configuration-only support as discovery. Their native
scenarios verify source changes before typing/upload, owner preservation,
actual values/digests and zero submissions. The complete ordinary reader group
awaits these scenarios; the separate answer group awaits automatic current-page
filling, links, time zones, salary/subject matching and challenge waiting.

The acceptance collector must retain every selected focused test, its exact
source, both registered native group completions, private-source semantic
receipts and all five successful workflows for the same published revision.
The earlier automatic scenario additionally checks two real PDF attachments,
six field receipts, cross-origin city/time-zone readback, lost-response recovery,
preserved owner/unknown values and a manually opened later page. Older scenarios
without semantic envelopes require review of their awaited assertion source.

These isolated native fixtures establish the shared accessible form contract.
They do not claim authenticated Google/Yandex accounts, a live model request,
complete HH application orchestration or assignment implementation. Those
separate workflows and every other unchecked criterion remain required; the PR
stays draft and unmerged.
