# Test assignment repositories

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) adds reviewed GitHub publication to the existing assignment hold. Open/read a form in **More → Forms**, choose a profile and plan its answers. A recognized assignment holds ordinary answers and PDF uploads until its repository is confirmed. Existing **Verify and save repository link** controls remain available.

Enable the local draft model in Questions/Forms settings first. GitHub publication uses the server's authenticated `gh` CLI and Git credentials; account credentials stay on the server. In the publishing panel, choose `owner/repository`, public/private visibility, an optional HH vacancy URL and additional employer aliases. **Draft issue and repository plan** reads context and saves a private preview; it does not create a repository or issue. Review the exact English issue, requirements, language, stack, template source and visibility, then publish explicitly. Without a server capability, the publication controls are unavailable.

A vacancy URL opens a separate owned browser using the saved `assignments` browser policy and headed default. Log in manually when needed. The reader captures visible title, employer, skills and description, closes its browser and caches only a successful read. Refresh is explicit. An exact form link in actual saved HH messages can supply the vacancy, including original/redirect URL aliases. Conflicting vacancy associations require an explicit URL. No chat association means the preview discloses unavailable vacancy context and the model chooses a fitting supported stack.

The current primary **Recommended CI/CD Templates** table in Hive Mind is read before the built-in fallback. The preview identifies fallback use. An explicitly named role language takes precedence over incidental technologies. Actual GitHub templates use `gh repo create --template`; other template repositories are cloned with their history and pushed. Existing target files are preserved while missing workflows and template history are added. A target that already has a pipeline retains it. Reruns update the uniquely marked assignment issue and repair a missing pipeline after a fresh preview.

English prose, known employer names/inflections/transliterations and six consecutive source words have conservative local checks. Review fidelity and aliases the application cannot infer. A written assignment's issue requests Markdown under `docs/`, original-language output, the source length limits, a proposed stack and a README linking to the result. Publication confirms repository, workflow files and issue readback; it does not execute the assignment, certify CI success or submit the employer's form.

## CLI

Use a saved inspection from `forms-read`, or inspect an actual form with `--url`. Configure the model through the existing `answers model` commands. Commands below use the `meta-sovereign` executable:

```sh
meta-sovereign test-assignment task-name --file=inspection.json --vacancy=https://hh.ru/vacancy/12345 --visibility=private --employer='Employer alias' --dry-run --store=./store
meta-sovereign test-assignment owner/task-name --file=inspection.json --vacancy=https://hh.ru/vacancy/12345 --visibility=private --store=./store
meta-sovereign test-assignment --draft-id=assignment-draft:UUID --store=./store
```

A bare name resolves the authenticated owner, or accepts `--owner`. Private visibility is the default. `--dry-run` saves and prints the preview. Without it the CLI publishes the generated draft. Recover the exact printed `draft.id` with `--draft-id`; recovery does not run the model again. An explicit `--vacancy-snapshot` accepts a bounded Lino snapshot with `title`, `description`, `company` and `skills`; choose a snapshot or URL. `--refresh-vacancy=true` rereads a URL. SIGINT/SIGTERM stop and drain owned model, browser and command work before the store closes.

## API and recovery

Trusted POST endpoints use the existing text/binary Lino negotiation:

| Endpoint                        | Input                                                                                                                               | Result                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/api/forms/assignment/draft`   | `inspection`, current assignment `revision`, `target`, `visibility`, optional `vacancyUrl`/`vacancy`, `refreshVacancy`, `employers` | Private saved `draft` and `state: draft`                                              |
| `/api/forms/assignment/restore` | `inspection`, current assignment `revision`                                                                                         | Saved draft and whether publication was attempted; no GitHub/model calls              |
| `/api/forms/assignment/publish` | `draftId`                                                                                                                           | Verified repository, issue and new assignment revision, or retained `uncertain` phase |

Writes flush private intent before issue. Lost responses stay uncertain and keep the form held. **Recover the same publication** checks actual identity and marked-issue readback without repeating unknown creations. After reopening the form, read/plan it and choose **Restore saved draft after reopening**, then recover that draft. A changed assignment/model, another pending draft, recreated repository or owner-edited issue refuses stale publication. Unknown outcomes without a positive receipt remain unresolved for manual inspection.

Private version-1 namespaces are `assignment-draft:` (reviewed prose/context), `assignment-publication:` (issued effects/receipts), `assignment-vacancy:` (successful snapshots) and `form-vacancy:` (exact aliases and HH message provenance). Existing record shapes are unchanged. These records can contain private assignment and vacancy text; ordinary backup/storage policy applies. Optional identifier/state tracing uses the existing default-off question diagnostics.

See [implementation and verification evidence](case-studies/issue-56/assignment-publication.md). Complete provider workflows and the other open requirements in issue 56 remain unfinished.
