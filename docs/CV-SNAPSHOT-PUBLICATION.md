# Publish a saved CV snapshot

The CV screen can publish a verified HH owner-save snapshot, native résumé export or saved HH/LinkedIn experience document to an existing local
Git repository and its configured remote. Publication is optional. Observation,
preparation, status and reload never commit or push anything.

In **CV → Saved CV snapshots**, choose a saved CV or a native export under **Saved CV source**, then enter the repository root,
remote name and snapshot folder, then select **Review publication**. Inspect the
exact sanitized Lino content and target. Check the confirmation and select
**Commit and push snapshots**. Changing the target or saved CV clears consent;
reloading requires fresh consent. A local server with Git and an authenticated
remote is required. Credentials stay in the existing Git configuration.

The CLI exposes the same separate operations:

```bash
meta-sovereign vacancies-cv-publish-plan --repository=/path/to/repository --resumes=<saved-hash> --request-id=<new-id>
meta-sovereign vacancies-cv-publish --request-id=<reviewed-id> --confirmation=<reviewed-digest> --publish=true
meta-sovereign vacancies-cv-publish-status --request-id=<reviewed-id>
```

The plan returns the digest, exact file content, current branch and base commit.
Optional `--remote=origin`, `--directory=examples/cv-snapshots`,
`--browser-slot=jobs` and `--store=<dir>` choose the target and private workspace.
One CLI plan can select up to 20 distinct saved hashes separated by commas.
For a verified native export, add `--export-id=<id>` to the plan command and select résumé hashes belonging to that export. The equivalent API field is `exportId`. The server checks the private `resume.json` bytes against their export receipt, verifies the browser slot, language and title, then sanitizes the content again. It never refreshes an export or opens a provider browser during publication.

In **CV → Experience documents**, the publication review also lists saved HH
and LinkedIn document revisions. Choose the exact source, captured time and
revision, then review and confirm its public projection through the same flow.
The CLI alternative is:

```bash
meta-sovereign vacancies-cv-publish-plan --repository=/path/to/repository --experience-revision=<64-character-revision> --request-id=<new-id>
```

The corresponding API field is `experienceRevision`. It selects one immutable
document; omit `exportId` and `resumes` (or use exactly that revision as the sole
resume). The public CV allowlist includes name, title, profile skills, About and
workplace company, role, dates, location, description, website and industries.
Without a profile title, the heading is **Experience** (or **Опыт работы**).
Missing required public fields or incomplete industry metadata refuse the plan
before Git. The review applies the existing contact, birth-date and salary
filter; inspect the exact content before choosing a public destination. Private
originals retain every field, per-job skills, native metadata, media and provenance.
Publishing a captured document does not prove a new save at HH or LinkedIn and
does not apply an edit plan or refresh a provider browser.

Plans expire after 24 hours and refuse if a selected saved snapshot,
native-export provenance or immutable document changes or disappears.

HTTP clients use trusted `POST /api/vacancies/cv-publish-plan`, trusted
`POST /api/vacancies/cv-publish` and read-only
`GET /api/vacancies/cv-publish-status`. The plan body contains `requestId`,
`browserSlot`, `repository`, `remote`, `directory` and `resumes`. Publishing
requires the reviewed `requestId`, `confirmation` and boolean `publish: true`.
Both text and binary Links Notation use the same validation; JSON compatibility
follows the server's configured transport policy.

Only generated, content-addressed `.lino` snapshots enter the new commit. Private
full exports, PDFs, backups, pending plans and unrelated staged changes stay as
they were. The current local and remote branch must initially match. A changed
branch, remote, conflicting snapshot path or symlink refuses. Publication adds
no force push, tags, submodule pushes or local hooks. Existing branch history
remains intact; it is the owner's responsibility to choose an appropriate
repository and review the displayed CV fields.

`published` means the remote branch confirmed the exact commit. `unchanged`
means the same content already exists at the matching local/remote baseline.
If Git, storage acknowledgement or cancellation leaves an uncertain outcome,
inspect the local branch and remote manually. Status, restart and repeating the
same request never retry that attempt. A fresh request is an explicit new
review, not a recovery retry.

Sources are the verified owner-save snapshot cache, checked native-export artifacts and immutable experience documents. Publication from every
remaining edit pipeline and complete reference workflow parity remain
unfinished. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
retains the broader requirement inventory and verification evidence.
