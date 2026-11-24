# Review experience changes in sequence

Use `cv-experience-review-start` to acquire both private experience snapshots, build the translated directional comparison, and open the first supported native draft. The same workflow is available with **Review changes one by one** in CV → Experience → Acquire both profiles and compare. The queue can also start from an existing completed acquisition.

```sh
meta-sovereign cv-experience-review-start \
  --url=https://www.linkedin.com/in/example-person/details/experience/ \
  --to=hh --resume=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --request-id=experience-review
meta-sovereign cv-experience-review-status --request-id=experience-review
```

Inspect the prepared data in the provider's editor. The owning console accepts `y` for Save, `s` for Skip, and `q` or EOF to leave the draft open. The CV view exposes the same actions with the current comparison and request ID. Save uses the exact current native editor. Skip invokes that editor's discard action, and leaving releases ownership with the draft still open. The queue reports manual changes and retains the original comparison and target-only records.

After a provider confirms Save, the queue performs a new native export for the target identity and checks the saved fields again. It pins the new target alongside the original source before selecting another item. A stale or unavailable export interrupts the review at that checkpoint. Recover review or `cv-experience-review-resume --request-id=experience-review` can repeat the readback or comparison while preserving the original Save receipt. If native editor ownership was lost before confirmation, recovery reads the existing job. Unknown outcomes stay unconfirmed.

Recover review can also continue after the queue records a verified Save or Skip and before the next editor opens. It uses the recorded comparison and opens only the remaining draft. If the last decision finished the queue, recovery completes it using the stored receipt. [Checkpoint reproduction](experience-review-checkpoint.md)

The queue records the post-Save comparison request before starting it. If the comparison finished before an interruption, recovery uses the recorded result and preserves both the saved CV revision and comparison fingerprint. [Comparison recovery](experience-review-replan.md)

The queue also records the target export request before reading the provider. Recovery can verify the completed export and reuse its exact revision. A stale readback leaves the review interrupted and requires explicit recovery to fetch again. [Export recovery](experience-review-refresh.md)

If both acquisitions and the comparison completed before the first editor opened, Recover review can use that original preparation. Status checks the exact saved result, then the owner decides whether to open the next native draft. [Acquisition recovery](experience-review-acquisition.md)

If recovery reaches an editor request recorded before native admission, the native service can admit the same request once. An existing native receipt keeps its outcome, and a recorded owner decision limits recovery to status. [Editor recovery](experience-review-opening.md)

The original comparison also remains available if its own receipt was acknowledged before the automatic preparation recorded completion. [Comparison receipt recovery](experience-auto-comparison-recovery.md)

The local-device UI and JSON commands use the same service as the text and binary Lino routes under `/api/cv/experience/review-*`. Status reads never launch a browser. The active decision checks the parent request, selected change and native request together. Requests and receipts remain private. No automatic model decision submits a provider form.

## Reproduction and validation

Expand the automatic comparison controls in CV. In the previous bundle the form can acquire both profiles and build a comparison. To queue the resulting changes, use the new action with an owned LinkedIn experience URL and HeadHunter résumé. Review the first provider draft and Save or Skip. After Save, the queue needs to read back a matching target export before it advances.

- `js/tests/cv-experience-review.test.js` exercises the HTTP workflow through both Lino encodings, including request mismatch, cross-origin refusal, stale export, recovery without replay, and Skip. The foreground test exercises Save, new target revision before the next editor, and EOF.
- `experiments/issue-56/experience-review-browser.mjs` compares the previous and current production CV bundles with a disposable Chromium fixture. The fixture hydrates a reactive HeadHunter editor, confirms one owner Save and one fresh export, and checks recovery after reload. Hosted CV browser checks include the same scenario.
- Independent Playwright MCP at 390 pixels verified the proposed and current About values, one explicit Save with a matching revision, and no horizontal overflow. The fixture's standalone host returned 404 for the default favicon.
- [Previous comparison controls](../../screenshots/issue-56-experience-review/before.png), [phone review](../../screenshots/issue-56-experience-review/prepared-phone.png), [native draft](../../screenshots/issue-56-experience-review/native-draft.png) and [verified receipt](../../screenshots/issue-56-experience-review/saved-phone.png).

The queue can open HeadHunter About, HeadHunter workplace, LinkedIn position and [existing LinkedIn About](experience-linkedin-about-review.md) drafts. An absent or unrecognized LinkedIn About editor needs manual review. Authenticated HeadHunter and LinkedIn acceptance is required for HH21.
