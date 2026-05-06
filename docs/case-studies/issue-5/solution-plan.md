# Solution Plan for Issue #5

The plan turns each requirement in [`requirements.md`](./requirements.md)
into a concrete deliverable. The order matches the order PR #22 lands
them.

## Plan

1. **Capture the issue.** Save `data/issue.json` and
   `data/comments.json` straight from the GitHub REST API so future
   readers do not have to re-fetch them. Author the case-study
   artefacts (`README.md`, `requirements.md`, `solution-plan.md`,
   `components.md`, `external-research.md`) — covers `R-R13`, `R-R14`,
   `R-R15`.
2. **Add the `github` source adapter.** Create
   `js/src/sources/github.js` with:
   - `parseArchive(input)` that accepts an array or an envelope
     `{ issues, comments, pulls, reviewComments, reviews, discussions }`
     and yields `msg:github:*` links — covers `R-R1`, `R-R2`.
   - `createGithubLive({ token, owner, repo, fetchImpl, baseUrl })`
     exposing:
     - `pullMessages()` walking issues → comments → pulls → review
       comments → reviews via `requestJson()` and a `paginate()`
       helper that follows `Link: rel="next"` headers — covers
       `R-R3`, `R-R4`.
     - `listRepos()` paginating `/user/repos` — covers `R-R8`.
     - `cloneRepo({ owner, repo, ref?, store? })` downloading the
       `tarball` archive, gunzipping it, walking USTAR/PAX blocks,
       and writing one `repo:<owner>/<name>:file:<path>` link per
       file plus a `repo:<owner>/<name>` index link — covers `R-R6`,
       `R-R7`.
     - `post(content, { issueNumber })` issuing
       `POST /repos/{owner}/{repo}/issues/{n}/comments` — covers
       `R-R5`.
3. **Register the source.** Add `github` to
   `js/src/sources/index.js` so `listSources()`, `importInto()`, and
   `pullLiveInto()` work for it — covers `R-R1`.
4. **Add server routes.** Extend `js/src/server/routes-mutating.js`
   with `POST /api/github/pull`, `POST /api/github/clone`, and
   `POST /api/github/post-comment`, all of which read
   `secret:github:access-token` from the store, call into the live
   adapter, and stamp imported links — covers `R-R4`, `R-R10`.
5. **Add CLI subcommands.** Extend `js/src/cli/index.js` with:
   - `source-pull --source=github --owner=<o> --repo=<r>` (already
     routed via `pullLiveInto`).
   - `github-clone --owner=<o> --repo=<r> [--ref=<r>] [--store=<dir>]`.
   - `github-comment --owner=<o> --repo=<r> --issue=<n> --text=<t>`.
     The new commands write through the same `pullLiveInto` /
     `createGithubLive` paths — covers `R-R9`, `R-R5`, `R-R6`.
6. **Add the connection guide.** Add a `github` entry to
   `providerCatalogue` in
   `js/src/web/connection-guides.js`:
   - Archive accepts `.json` (REST API JSON exports).
   - Single password field `token` persisted at
     `secret:github:access-token`.
   - Probe URL `https://api.github.com/user` with header
     `Authorization: Bearer {token}`.
   - Error hints for 401/403 (token rejected / scope missing).
   - English-only string today; the SPA i18n test only enforces
     translations for the static UI keys, not the catalogue strings.
   - The guide does not get a "Connect first" entry in the chat /
     contacts views because GitHub conversations are not the primary
     unified inbox; users opt into them through Settings. Covers
     `R-R11`, `R-R12`.
7. **Add tests first.** Author
   `js/tests/github-source.test.js` with cases for:
   - Archive import (issue + issue comment + pull request + PR review
     comment + review summary in the same envelope).
   - `pullMessages` with a stub `fetchImpl` returning canned issues +
     comments + pulls (one mock entry per surface).
   - `listRepos` with two pages joined by a `Link: rel="next"` header.
   - `cloneRepo` with a small in-memory tarball (USTAR header + 512
     byte body) decoding into expected `repo:<owner>/<name>:file:*`
     links.
   - `post()` issuing the right URL/body for an issue comment.
   - Source registry sanity (`listSources()` includes `github`,
     `importInto(store, 'github', envelope)` writes the expected links).
     Covers `R-R16`.
8. **Update top-level docs.**
   - Append a new `R-R*` table to `docs/REQUIREMENTS.md`.
   - Mention GitHub in the README "Unified inbox" line and the
     repository-structure paragraph.
     Covers `R-R17`.
9. **Add a changeset.** `bun run changeset` style: drop a
   `*.md` file under `.changeset/` so the release workflow can pick it
   up. The summary cites `R-R*` per the traceability rule.
10. **Finalize the PR.** Run the local fast checks (`bun run lint`,
    `bun run format:check`, `node --test js/tests/github-source.test.js js/tests/sources.test.js`),
    update the PR body with reproduction steps and link the case study,
    and flip from Draft to ready. Covers `R-R18`.

## Result

The plan above is what PR #22 ships. The adapter is intentionally
small and dependency-free so it works in the SPA, the JS server, and
the CLI without runtime-specific shims. The repository clone uses the
GitHub REST `tarball` endpoint plus a 60-line tar reader so we do not
have to bundle `isomorphic-git` or shell out to `git` / `gh`.
Authentication piggy-backs on the existing `secret:*` link encryption,
and the case-study artefacts document the analysis the issue requested.
