# Case Study: Issue #5 — Add GitHub support

**Issue:** [#5 — Add GitHub support](https://github.com/link-foundation/meta-sovereign/issues/5)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-5-bb4787c0c23a`
**Pull Request:** [#22](https://github.com/link-foundation/meta-sovereign/pull/22)

This case study collects every directive from issue #5, decomposes it
into atomic requirements (`R-R*`), records the prior art and tooling
surveyed, and lays out the solution plan that PR #22 implements
against the existing local-first / privacy-first design constraints
already established in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md).

The artefacts in this folder are:

| File                   | Purpose                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                                              |
| `requirements.md`      | Atomic requirement list (`R-R*`) extracted from the issue.                                                        |
| `solution-plan.md`     | Phased plan mapping each requirement to a concrete deliverable in PR #22.                                         |
| `components.md`        | Catalogue of upstream tooling and standards consulted, plus the components reused from this repository.           |
| `external-research.md` | Summary of external research about the GitHub REST API, CORS, personal access tokens, and tar/zip decompression.  |
| `data/`                | Raw artefacts (`issue.json`, `comments.json`) used to build this study.                                           |

---

## 1. Vision (paraphrased from the issue)

The reporter asks the project to support **communication via GitHub** —
issues, comments, pull requests, and "so on" — and to make it possible
to **download every repository locally and index it in the links
store**. The case study is itself a deliverable: the issue insists on
a `docs/case-studies/issue-{id}/` folder with deep analysis, online
research, an explicit requirement list, a per-requirement solution
plan, and a survey of existing components or libraries that could
help. Everything must land in a single PR that iterates until each
requirement is fully addressed.

The directive sits at the intersection of two of the project's
existing pillars:

- **Unified inbox.** GitHub becomes the eleventh `MessageSource`
  alongside email, Telegram, VK, X, WhatsApp, Facebook, LinkedIn,
  career.habr.com, hh.ru, and superjob.ru. Issues and PR comments are
  effectively threaded chats, so reusing
  [`buildMessageLink()`](../../../js/src/sources/link.js) and
  [`stampSourceLink()`](../../../js/src/sources/index.js) is a natural
  fit.
- **Repository-as-data.** The directive to "index repositories in the
  links store" is closer to a developer tool than to a chat surface.
  It needs a separate link prefix (`repo:<owner>/<name>:*`) so
  repository content does not pollute the chat / contacts views, and
  it needs a way to download the working tree without bundling a git
  client into the SPA.

## 2. Decomposed requirements

Eighteen atomic requirements (`R-R1..R-R18`) come out of the issue.
The full list — with the implementation status for each — lives in
[`requirements.md`](./requirements.md). At a glance:

- **R-R1..R-R5** — bidirectional GitHub source (issues, comments,
  PRs, reviews, posting back).
- **R-R6..R-R8** — repository download, metadata indexing, and a
  `listRepos()` enumeration helper.
- **R-R9..R-R12** — CLI / server / SPA surfaces and the existing
  secret-store contract for personal access tokens.
- **R-R13..R-R18** — the case-study artefacts, library survey,
  reproducing tests, top-level docs, and the single-PR delivery rule.

## 3. Solution overview

The implementation lives almost entirely in
[`js/src/sources/github.js`](../../../js/src/sources/github.js):

- `githubSource.parseArchive(input)` accepts both a `gh api` style
  JSON dump (an array of payloads) and a structured envelope
  `{ issues, comments, pulls, reviews, reviewComments, discussions }`,
  yielding `msg:github:<external_id>` links via `buildMessageLink()`.
- `createGithubLive({ token, owner, repo, fetchImpl, baseUrl })`
  wraps the REST API:
  - `pullMessages()` walks issues → comments → pulls → PR review
    comments → review summaries with one paginated `requestJson()`
    call per surface.
  - `listRepos()` paginates `/user/repos`.
  - `cloneRepo({ owner, repo, ref, store })` fetches the `tarball`
    archive, gunzips it with `node:zlib`, walks the entries with a
    small in-file tar reader, and writes one
    `repo:<owner>/<name>:file:<path>` link per file plus a
    `repo:<owner>/<name>` index link with metadata children.
  - `post({ text }, { issueNumber })` issues
    `POST /repos/{owner}/{repo}/issues/{n}/comments`.
- The adapter is registered in
  [`js/src/sources/index.js`](../../../js/src/sources/index.js) so the
  existing `importInto()` and `pullLiveInto()` paths apply
  automatically.
- The JS server adds three new mutating routes (`/api/github/pull`,
  `/api/github/clone`, `/api/github/post-comment`) that read the PAT
  from `secret:github:access-token` and stamp imported links with
  `stampSourceLink(link, 'github')`.
- The CLI gains `github-clone` and `github-comment` subcommands and
  routes `source-pull --source=github` through the existing live
  pipeline.
- The SPA `providerCatalogue` (in
  [`js/src/web/connection-guides.js`](../../../js/src/web/connection-guides.js))
  gets a `github` card with archive accept filter `.json`, a single
  password field for the PAT, and a `https://api.github.com/user`
  probe URL with `Bearer {token}` interpolation.

The full per-requirement deliverable map lives in
[`solution-plan.md`](./solution-plan.md); the libraries we *did not*
adopt (Octokit, isomorphic-git, simple-git, `gh` shell-out) are
documented with rationale in [`components.md`](./components.md).

## 4. Why not Octokit / isomorphic-git?

The project keeps every source adapter dependency-free so the same
file works in Bun, Node, Deno, and the browser. Octokit is the most
complete first-party SDK but adds a multi-package dependency tree and
its own pagination/retry abstraction we do not need. isomorphic-git
gives us a real working copy with history, but the directive is to
"index repositories in the links store" — a flat file index seeded
from the GitHub `tarball` endpoint covers the requirement and avoids
shipping a git implementation. Shelling out to `git` / `gh` from the
server hides the API surface from unit tests and forces an external
binary on every install.

## 5. Verification

Run the new tests directly:

```bash
node --test --test-timeout=30000 js/tests/github-source.test.js
```

The suite covers archive import, live `pullMessages`, `listRepos`,
`cloneRepo` indexing, `post()` comment creation, and source-registry
integration with a stubbed `fetchImpl`. Together with
`js/tests/sources.test.js` (which now asserts the registry includes
`github`) and `js/tests/connection-guides-templates.test.js` (which
asserts `buildProbeUrl` interpolates the PAT) the expected behaviour
is locked in before any end-to-end run.

The PR description records the reproduction steps and the full local
verification log.
