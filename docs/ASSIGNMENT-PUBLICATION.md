# Test assignment repositories (languages: en • [zh](ASSIGNMENT-PUBLICATION.zh.md) • [hi](ASSIGNMENT-PUBLICATION.hi.md) • [ru](ASSIGNMENT-PUBLICATION.ru.md))

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) adds reviewed GitHub publication to the existing assignment hold. Open/read a form in **More → Forms**, choose a profile and plan its answers. A recognized assignment holds ordinary answers and PDF uploads until its repository is confirmed. Existing **Verify and save repository link** controls remain available.

Enable the local draft model in Questions/Forms settings first. GitHub publication uses the server's authenticated `gh` CLI and Git credentials; account credentials stay on the server. In the publishing panel, choose `owner/repository`, public/private visibility, an optional HH vacancy URL and additional employer aliases. **Draft issue and repository plan** reads context and saves a private preview; it does not create a repository or issue. Review the exact English issue, requirements, language, stack, template source and visibility, then publish explicitly. Without a server capability, the publication controls are unavailable.

A vacancy URL opens a separate owned browser using the saved `assignments` browser policy and headed default. Log in manually when needed. The reader captures visible title, employer, skills and description, closes its browser and caches only a successful read. Refresh is explicit. An exact form link in actual saved HH messages can supply the vacancy, including original/redirect URL aliases. Conflicting vacancy associations require an explicit URL. No chat association means the preview discloses unavailable vacancy context and the model chooses a fitting supported stack.

Use **Instruction document URL** when the form links to a separate HTML or plain-text task. Its visible instructions are read in a separate owned browser using the same saved visibility policy. Review the resolved page title and capture time beside the draft. The private saved draft retains the captured text and fingerprint; restore and publication use that snapshot without rereading the page. Hidden text, editable answers and form values are excluded. Login, verification, HTTP errors, PDF/canvas/embedded documents and text exceeding the finite limits refuse before model execution. Supply a readable text version for those documents. This reader does not automatically follow further document links.

The current primary **Recommended CI/CD Templates** table in Hive Mind is read before the built-in fallback. The preview identifies fallback use. An explicitly named role language takes precedence over incidental technologies. Actual GitHub templates use `gh repo create --template`; other template repositories are cloned with their history and pushed. Existing target files are preserved while missing workflows and template history are added. A target that already has a pipeline retains it. Reruns update the uniquely marked assignment issue and repair a missing pipeline after a fresh preview.

Use **Template language** to choose a supported language explicitly. The preview identifies your choice and the resulting template. Changing the selection clears the preview for a fresh review. Restoring a saved draft restores its choice, and recovery keeps the choice from the issued draft. The default uses the vacancy or assignment.

For instructions received outside a form, open **Draft from assignment instructions** in Forms. Enter the target repository and either paste the instructions or enter a readable instruction document URL. Review and publish using the same controls. Restore the latest saved draft by entering the same target. Pasted text is stored privately with the saved draft and restored for review. The publication receipt confirms the repository and issue alone. Form associations use the form’s own review.

English prose, known employer names/inflections/transliterations and six consecutive source words have conservative local checks across both form and linked instructions, including the document title. Review fidelity and aliases the application cannot infer. A written assignment's issue retains **Deliverable and stack** instructions and a final **Stack** section requesting Markdown under `docs/`, original-language output, source length limits, a proposed stack and a README linking to the result. Publication confirms repository, workflow files and issue readback; it does not execute the assignment, certify CI success or submit the employer's form.

## CLI

Use a saved inspection from `forms-read`, or inspect an actual form with `--url`. Configure the model through the existing `answers model` commands. Commands below use the `meta-sovereign` executable:

```sh
meta-sovereign test-assignment task-name --file=inspection.json --vacancy=https://hh.ru/vacancy/12345 --visibility=private --employer='Employer alias' --dry-run --store=./store
meta-sovereign test-assignment owner/task-name --file=inspection.json --vacancy=https://hh.ru/vacancy/12345 --visibility=private --store=./store
meta-sovereign test-assignment owner/task-name --file=inspection.json --source=https://example.org/instructions --language=python --dry-run --store=./store
meta-sovereign test-assignment owner/task-name --from=instructions.txt --dry-run --store=./store
cat instructions.txt | meta-sovereign test-assignment owner/task-name --from=- --dry-run --store=./store
meta-sovereign test-assignment owner/task-name --source=https://example.org/instructions --dry-run --store=./store
meta-sovereign test-assignment --draft-id=assignment-draft:UUID --store=./store
```

A bare name resolves the authenticated owner, or accepts `--owner`. Private visibility is the default. `--dry-run` saves and prints the preview. Without it the CLI publishes the generated draft. Recover the exact printed `draft.id` with `--draft-id`; recovery does not run the model again. An explicit `--vacancy-snapshot` accepts a bounded Lino snapshot with `title`, `description`, `company` and `skills`; choose a snapshot or URL. `--refresh-vacancy=true` rereads a URL. SIGINT/SIGTERM stop and drain owned model, browser and command work before the store closes.

`--from=<form-url>` is an alias for `--url`. A local file or piped `--from=-` accepts UTF-8 instructions up to 30,000 characters. An instruction `--source` used alone selects a standalone document. A `--source` used with a form records the linked document alongside the form instructions.

## API and recovery

Trusted POST endpoints use the existing text/binary Lino negotiation:

| Endpoint                        | Input                                                                                                                                                                | Result                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/api/forms/assignment/draft`   | `inspection`, current assignment `revision`, `target`, `visibility`, optional `vacancyUrl`/`vacancy`, `sourceUrl`, `languageOverride`, `refreshVacancy`, `employers` | Private saved `draft`, optional `sourceEvidence` and `languageOverride`, and `state: draft` |
| `/api/forms/assignment/restore` | `inspection`, current assignment `revision`                                                                                                                          | Saved draft and whether publication was attempted; no GitHub/model calls                    |
| `/api/forms/assignment/publish` | `draftId`                                                                                                                                                            | Verified repository, issue and new assignment revision, or retained `uncertain` phase       |

For a standalone draft, pass `standalone: true`, `target`, `visibility` and exactly one of `sourceText` or `sourceUrl` in the same draft endpoint. Restore with `standalone: true` and `target` to obtain the saved draft, attempt state and any pasted text. Publish with `draftId`. The standalone receipt has the verified repository and issue. Private `standalone-assignment:` records retain the latest draft selection by normalized repository target.

Writes flush private intent before issue. Lost responses stay uncertain and keep the form held. **Recover the same publication** checks actual identity and marked-issue readback without repeating unknown creations. After reopening the form, read/plan it and choose **Restore saved draft after reopening**, then recover that draft. A changed assignment/model, another pending draft, recreated repository or owner-edited issue refuses stale publication. Unknown outcomes without a positive receipt remain unresolved for manual inspection.

Private version-1 namespaces are `assignment-draft:` (reviewed prose/context), `assignment-publication:` (issued effects/receipts), `assignment-vacancy:` (successful snapshots) and `form-vacancy:` (exact aliases and HH message provenance). Existing record shapes are unchanged. These records can contain private assignment and vacancy text; ordinary backup/storage policy applies. Optional identifier/state tracing uses the existing default-off question diagnostics.

See [implementation and verification evidence](case-studies/issue-56/assignment-publication.md). Complete provider workflows and the other open requirements in issue 56 remain unfinished.
