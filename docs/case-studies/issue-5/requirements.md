# Requirements for Issue #5

The directive in issue #5 is:

> We need to be able to support communication via GitHub like issues,
> comments, pull requests and so on, with ability to download all our
> repositories locally and index them in links store.

It then asks for case-study artefacts under
`docs/case-studies/issue-5/`, deep analysis with online research, an
explicit list of every requirement, and a solution plan that surveys
existing components and libraries. Everything is to land in a single
PR.

The atomic requirements derived from that directive are tracked with
the prefix `R-R*` (R for repository / GitHub, since R-Q is taken by
the i18n issue).

| ID    | Requirement                                                                                                                                           | State                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-R1  | Treat GitHub as a first-class `MessageSource` so issues, issue comments, pull requests, PR review comments, and discussions become normalized links.  | Done: `js/src/sources/github.js` registers a `github` source with `parseArchive`/`live.pullMessages` covering every comment-bearing surface.                                        |
| R-R2  | Allow archive imports of GitHub data (raw JSON exports from the REST API or `gh api` dumps).                                                          | Done: `parseArchive` accepts both an array of issues/PRs/comments and the standard `{issues:[], comments:[], pulls:[], reviews:[], reviewComments:[], discussions:[]}` envelope.    |
| R-R3  | Pull live data through the GitHub REST API (`/repos/{owner}/{repo}/issues`, `/issues/comments`, `/pulls`, `/pulls/comments`, `/pulls/{n}/reviews`).   | Done: `createGithubLive().pullMessages` walks repo issues, PRs, both comment streams, and review summaries with `Bearer` auth and a configurable `baseUrl`.                         |
| R-R4  | Support browser-direct calls when CORS allows; fall back to the local server for raw clones and authenticated bulk pulls.                             | Done: live calls use `requestJson()` so the SPA can run them in-browser; the JS server adds `POST /api/github/pull` and `POST /api/github/clone` for same-origin proxying.          |
| R-R5  | Allow posting comments back into GitHub (issues and pull requests) so the unified inbox stays bidirectional.                                          | Done: `createGithubLive().post(content, { issueNumber })` issues `POST /repos/{owner}/{repo}/issues/{n}/comments` and is wired through `email-send`-style CLI / server entrypoints. |
| R-R6  | Allow downloading every repository the user owns or watches and index the working tree as links in the local store.                                   | Done: `cloneRepo()` fetches the GitHub `tarball` archive, walks the entries, and writes one `repo:<owner>/<name>:file:<path>` link per file, plus a `repo:<owner>/<name>` index.    |
| R-R7  | Index repository metadata (description, default branch, topics, last push) alongside the file tree so the CRM can filter by repo.                     | Done: each clone seeds a `repo:<owner>/<name>` link with metadata children and stamps it through the source registry.                                                               |
| R-R8  | Expose `listRepos()` so the SPA, CLI, and server can enumerate the user's repositories before deciding what to clone.                                 | Done: `createGithubLive().listRepos()` paginates `/user/repos` and returns plain JSON the SPA can render.                                                                           |
| R-R9  | Add CLI subcommands so contributors can drive every feature without booting the SPA.                                                                  | Done: `source-pull --source=github`, `github-clone --owner=<o> --repo=<r>`, and `github-comment --issue=<n> --text=<t>` cover pull, clone, and post.                                |
| R-R10 | Add same-origin server routes so the browser SPA can use the JS server as a proxy when GitHub blocks cross-origin requests.                           | Done: `POST /api/github/pull`, `POST /api/github/clone`, and `POST /api/github/post-comment` route to `createGithubLive()` and stamp imported links via `stampSourceLink`.          |
| R-R11 | Add a connection guide entry for GitHub in the SPA Settings catalogue so users can paste a personal access token and probe `/user`.                   | Done: `providerCatalogue.github` declares the archive accept filter, `secret:github:token` field, `https://api.github.com/user` probe URL, and `Bearer` headers.                    |
| R-R12 | Honour the existing secret-store contract (`secret:*` links, AES-256-GCM at rest) for GitHub PATs.                                                    | Done: the connection guide writes the token into `secret:github:access-token`, which `wrapSecretStore` already encrypts.                                                            |
| R-R13 | Compile issue #5 research and evidence under `docs/case-studies/issue-5/`.                                                                            | Done: this folder contains `data/issue.json`, `data/comments.json`, `README.md`, `requirements.md`, `solution-plan.md`, `components.md`, and `external-research.md`.                |
| R-R14 | Research existing GitHub integration libraries (Octokit, `gh`, `isomorphic-git`, `simple-git`) and the GitHub REST API surface before implementation. | Done: `external-research.md` and `components.md` capture the libraries, why a small dependency-free adapter was preferred, and the relevant REST endpoints.                         |
| R-R15 | Enumerate every requirement from the issue and propose a solution per requirement.                                                                    | Done: this file lists `R-R1..R-R18` and `solution-plan.md` maps them to deliverables.                                                                                               |
| R-R16 | Ship reproducing automated tests before the implementation.                                                                                           | Done: `js/tests/github-source.test.js` covers archive import, live `pullMessages`, `listRepos`, `cloneRepo` indexing, and `post()` comment creation with an injected `fetchImpl`.   |
| R-R17 | Update top-level `docs/REQUIREMENTS.md` and `README.md` so future contributors discover GitHub support.                                               | Done: `REQUIREMENTS.md` gains the `R-R*` table; `README.md` lists GitHub alongside the other ten networks.                                                                          |
| R-R18 | Land everything in a single pull request that iterates until each requirement is fully addressed.                                                     | In progress: PR #22 on branch `issue-5-bb4787c0c23a`.                                                                                                                               |
