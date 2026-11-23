# Review an existing LinkedIn About section

In CV → Experience, reopen a directed comparison to LinkedIn from its request ID. In **Separate profile review**, inspect the current About text and the proposed value, then choose **Prepare About in LinkedIn**. Review the provider's draft and choose **Save in LinkedIn**, **Skip and discard**, or **Leave draft open**. The sequential experience queue offers the same decisions. LinkedIn documents the owner workflow through the About section’s Edit control. [LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a553140/edit-the-about-section-in-your-profile?lang=en)

```sh
meta-sovereign cv-experience-linkedin-about-start \
  --request-id=linkedin-about --plan-request-id=directed-comparison \
  --fingerprint="$reviewed_plan_fingerprint"
meta-sovereign cv-experience-linkedin-about-status --request-id=linkedin-about
```

The foreground command accepts `y` to Save, `s` to Skip, and `q` or end of input to leave the draft open. The device uses the same private job through the text and binary Lino `linkedin-about-*` operations. The job ties the comparison fingerprint to the acknowledged LinkedIn export and checks the current About text before opening the exact profile editor. It rechecks the value in the editor and preserves existing drafts, skills and other controls. An observed owner Save or an explicit app Save needs a matching fresh profile before the job reports success. A stale readback stays unconfirmed. The sequential queue also requires a newly acquired target revision before moving to another change.

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

This evidence covers a rendered About section with a recognized owner editor. Adding an absent About section and acceptance with authenticated HeadHunter and LinkedIn accounts remain unfinished under HH21. [Experience workflow inventory](experience-sync-plan.md)
