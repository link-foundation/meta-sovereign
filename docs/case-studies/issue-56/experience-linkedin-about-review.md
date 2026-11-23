# Review a LinkedIn About change

In CV → Experience, reopen a directed comparison to LinkedIn from its request ID. In **Separate profile review**, inspect the current About text and the proposed value, then choose **Prepare About in LinkedIn**. Review the provider's draft and choose **Save in LinkedIn**, **Skip and discard**, or **Leave draft open**. The sequential experience queue offers the same decisions. LinkedIn documents the owner workflow through the About section’s Edit control. [LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a553140/edit-the-about-section-in-your-profile?lang=en)

```sh
meta-sovereign cv-experience-linkedin-about-start \
  --request-id=linkedin-about --plan-request-id=directed-comparison \
  --fingerprint="$reviewed_plan_fingerprint"
meta-sovereign cv-experience-linkedin-about-status --request-id=linkedin-about
```

The foreground command accepts `y` to Save, `s` to Skip, and `q` or end of input to leave the draft open. The device uses the same private job through the text and binary Lino `linkedin-about-*` operations. The job ties the comparison fingerprint to the acknowledged LinkedIn export and checks the current About text before opening the exact profile editor. It rechecks the value in the editor and preserves existing drafts, skills and other controls. An observed owner Save or an explicit app Save needs a matching fresh profile before the job reports success. A stale readback stays unconfirmed. The sequential queue also requires a newly acquired target revision before moving to another change.

On a profile with no About section, acquisition looks for the owner's **Add profile section → Core → Add about** action in the owned profile. It accepts an empty baseline only when that action appears uniquely in two consecutive observations and the menu can be dismissed. Acquisition leaves the editor unopened. Preparation rechecks the menu and requires a blank editor on the same profile. A profile change after export, a different editor destination or an existing draft stops the review before any Save. [LinkedIn Help on adding profile sections](https://www.linkedin.com/help/linkedin/answer/a540837/add-sections-to-your-profile)

## Reproduction and verification

The published parent `52f6e31a` displays the comparison values and lacks a native action. The standalone browser scenario fails against that bundle at the missing action assertion. On the updated bundle, it exercises real Chromium events in a controlled native editor, both Lino formats, independent owner Save, Skip with a discard dialog, Leave, EOF, owner edits, a foreign editor, origin and request mismatch, stale readback, cancellation of an unreceived Start, and the sequential queue. The browser records three synthetic Save requests, including one deliberately left unconfirmed, and one discard. All seven native review attachments are drained along with the acquisition attachments. Hosted CV browser checks include the same scenario. The adjacent acquisition, position and queue regressions pass 41 checks each in Node and Deno.

```sh
RUN_BROWSER_E2E=1 node experiments/issue-56/linkedin-about-browser.mjs
```

Independent Playwright MCP at 390 pixels confirms the three decision controls, the fresh-profile receipt and the absence of horizontal overflow. The fixture host returns 404 for its default favicon.

- [Previous comparison](../../screenshots/issue-56-linkedin-about/before.png)
- [Prepared on a phone](../../screenshots/issue-56-linkedin-about/prepared-phone.png)
- [Synthetic native editor](../../screenshots/issue-56-linkedin-about/native-draft.png)
- [Confirmed in the CV view](../../screenshots/issue-56-linkedin-about/saved-phone.png)

To reproduce the absent-section failure, acquire a LinkedIn fixture profile with the owner Add About action and target it with a directed comparison containing HeadHunter About text. The published parent `853faeb2` reports the acquisition boundary as `rendered-bottom` and omits the native review. Its focused Node regression also fails because the export leaves About unavailable. On the updated bundle, the Chromium scenario checks the `owner-add-about` boundary, refusals for newer About text, a foreign editor and an existing draft, then Skip and Save. It records one synthetic discard and one Save. A separate 390-pixel Playwright MCP session confirmed the three decisions and fresh readback, with a 390-pixel document width. The browser logged a missing favicon and a cache-write error during a successful render.

Both Chromium scenarios pass on the updated bundle. Node and Deno each pass 32 acquisition, position and experience-plan checks. ESLint previously reported two missing braces in the synthetic About fixture at lines 195 and 220. The corrected fixture and adjacent changed files pass with zero lint errors. [Earlier hosted lint job](https://github.com/link-foundation/meta-sovereign/actions/runs/45235528415/job/137911350870)

- [Previous view without the native action](../../screenshots/issue-56-linkedin-add-about/before.png)
- [Prepared addition on a phone](../../screenshots/issue-56-linkedin-add-about/prepared-phone.png)
- [Synthetic native Add About editor](../../screenshots/issue-56-linkedin-add-about/native-draft.png)
- [Addition confirmed by fresh readback](../../screenshots/issue-56-linkedin-add-about/saved-phone.png)

Acceptance with authenticated HeadHunter and LinkedIn accounts and the remaining native synchronization cases are unfinished under HH21. [Experience workflow inventory](experience-sync-plan.md)
