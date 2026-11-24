# Reviewed HeadHunter About changes

Open **CV sync** → **Experience documents** and retrieve a completed
**LinkedIn → HH** comparison against an acknowledged HeadHunter export. The
profile section shows the previous and proposed About text. Choose **Prepare
About in Experience window** to open one native review. The browser slot and
résumé come from the verified export. An unavailable About baseline, unresolved
translation, unrelated open editor or changed text blocks preparation.

Review the filled text in the dedicated HeadHunter Experience browser. Save in
that window or choose **Save in HeadHunter** in CV sync. **Skip and discard**
uses the native cancel action. **Leave draft open** releases the review without
changing the draft. A Save is confirmed only when the selected résumé's fresh
export contains the reviewed text. The request receipt retains the outcome and
export digest. It excludes the About text. Losing ownership after a Save attempt
cannot trigger a replay.

The terminal command is
`cv-experience-hh-about-start --plan-request-id=<comparison-id> --fingerprint=<comparison-sha256>`.
Use `y` to Save, `s` to discard and `q` or EOF to leave the draft open.
`cv-experience-hh-about-status --request-id=<review-id>` recovers the current
receipt. The corresponding `/api/cv/experience/hh-about-{start,status,decide,stop}`
endpoints accept both Lino encodings.

## Verification

The previous production bundle showed the difference without a native action.
The Chromium regression uses an isolated synthetic HeadHunter editor and the
production CV bundle. It verifies a populated draft with zero Saves, native Skip,
Leave, refusal of a programmatic Save after an owner edit and confirmation of a
trusted native Save. Playwright MCP independently completed a programmatic Save
at 390 CSS pixels. The page width remained 390 pixels. Focused checks exercise
verified export binding, a rejected plan digest, removal of the latest export,
CLI EOF, both Lino encodings and refusal to replay a reviewed Save.

- [Before the About review action](../../screenshots/issue-56-hh-about-review/before.png)
- [Prepared native draft](../../screenshots/issue-56-hh-about-review/native-draft.png)
- [Explicit review controls on a phone](../../screenshots/issue-56-hh-about-review/review-phone.png)
- [Fresh export confirmation on a phone](../../screenshots/issue-56-hh-about-review/saved-phone.png)

LinkedIn About writes, a checkpointed review queue and authenticated acceptance
remain required for HH21.
