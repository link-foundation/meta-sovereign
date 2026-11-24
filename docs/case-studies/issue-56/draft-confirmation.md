# Stored draft confirmation

The draft-send API previously bound its confirmation token to the request body,
then reread the pending draft when sending. A request containing only its ID
could therefore send text, a sticker or incoming-message evidence that changed
after preview. Supplying text did not freeze the other stored evidence. The
preview also showed `null` text when the request relied on the stored text.

The preview now renders the stored draft with the requested text/form overrides
and retains an independent snapshot with the single-use token. The runner
compares destination, draft/automation identity, form, content and full question
or personal-reply evidence before delivery. Changed drafts return HTTP 409 with
`draft-changed`, retain the pending draft and perform no typing or outbox/send
work. The owner can review the current draft to obtain a new confirmation.
Automatic-run confirmation uses the same comparison. Queue timestamps and
status metadata do not change the reviewed operation.

## Reproduction and verification

`python -B experiments/issue-56/draft-confirmation-parent.py` temporarily selects
the three changed production files from actual parent `3cd0d746`, runs only the
eight changed-draft assertions and restores every source in `finally`. Through
both default Lino encodings, text, sticker, replacement incoming context and
shared nested-context mutations each produce one actual mocked VK adapter send
on that parent. All eight assertions fail with `status: sent` and
`providerCalls: 1`. No authenticated provider session is used.

`js/tests/draft-confirmation.test.js` verifies refusal of all eight mutations,
zero provider calls/receipts/outbox entries and retained drafts after the fix.
It also checks actual rendered preview content, unchanged edited/form-overridden
text delivery once, and automatic-run binding of form, identity and full answer
evidence. Each server case has a finite 20-second test deadline and closes its
own fixture. Ten Node and ten Deno cases pass. Twenty-eight existing server,
gratitude and identity checks passed alongside the initial seven regressions.
Additional question-runner and CLI compatibility is retained in the archive.

An initial draft of the change placed the preview helper in the wrong return
object; focused verification caught it before commit. The corrected run and the
initial diagnostic remain preserved. This is a protocol correction with no
visual change; no new UI screenshot is claimed. Hosted matrices remain required
for the published head, and every unfinished issue criterion remains active.

[Checked sources, exact parent bytes and logs](data/draft-confirmation.tar.gz)
and [per-file SHA-256 manifest](data/draft-confirmation.tar.sha256.json).
