---
'meta-sovereign': minor
---

Establish project identity as `meta-sovereign` and land the case study for issue #1 (`docs/case-studies/issue-1/`).

The case study folder catalogues every requirement extracted from issue #1, surveys the linked libraries (links-notation, lino-objects-codec, doublets-rs, doublets-web, link-cli, lino-arguments, deep-foundation/sdk, plus the konard ingestion tools), summarises external research on local-first software, CRDT sync, unified messaging, encrypted-at-rest storage, browser SQLite, fuzzy search, and node editors, and proposes a phased solution plan with stable requirement IDs.

This release contains no runtime code yet — feature implementation lands milestone-by-milestone in subsequent PRs per `docs/case-studies/issue-1/solution-plan.md`.

- `package.json`: `name` set to `meta-sovereign`, description and keywords aligned with the project vision, repository URL pointed at `link-foundation/meta-sovereign`.
- `scripts/{validate,merge,publish,format-release-notes,create-manual}-changesets.mjs`: `PACKAGE_NAME` constants updated.
- `README.md`, `docs/CONTRIBUTING.md`: title and intro reflect the new project identity.
