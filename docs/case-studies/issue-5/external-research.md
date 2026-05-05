# External Research for Issue #5

The work is split into two adjacent sub-problems: **GitHub
communication** (issues, comments, pull requests) and **repository
download / indexing**. Both have well-documented APIs and a thick layer
of existing tooling. This file collects the primary sources surveyed
and the conclusions that drove the implementation.

## GitHub REST API endpoints used

The implementation uses the v3 REST API because every endpoint we need
returns JSON over plain HTTPS (no GraphQL schema dependency, no SDK
bundle), and the same calls work from `fetch()` inside the SPA, from
the JS server, and from the CLI:

- `GET /repos/{owner}/{repo}/issues?state=all&per_page=100` —
  paginated issue list. Pull requests are also surfaced here with a
  `pull_request` field, but the dedicated endpoint below is preferred
  to capture PR-only metadata such as `head`/`base`.
  Reference: <https://docs.github.com/en/rest/issues/issues>
- `GET /repos/{owner}/{repo}/issues/comments?per_page=100` — every
  issue comment for a repo, paginated.
  Reference: <https://docs.github.com/en/rest/issues/comments>
- `GET /repos/{owner}/{repo}/pulls?state=all&per_page=100` — pull
  requests with `head`/`base`/`merged_at`/`requested_reviewers`.
  Reference: <https://docs.github.com/en/rest/pulls/pulls>
- `GET /repos/{owner}/{repo}/pulls/comments?per_page=100` — inline PR
  review comments (the ones tied to a diff line).
  Reference: <https://docs.github.com/en/rest/pulls/comments>
- `GET /repos/{owner}/{repo}/pulls/{n}/reviews?per_page=100` — review
  summaries (approve / request-changes / comment) per pull request.
  Reference: <https://docs.github.com/en/rest/pulls/reviews>
- `POST /repos/{owner}/{repo}/issues/{n}/comments` — post a comment
  back into an issue or pull request (PRs share the issue endpoint for
  conversation comments).
  Reference: <https://docs.github.com/en/rest/issues/comments#create-an-issue-comment>
- `GET /user/repos?per_page=100` — list every repository the
  authenticated user owns or collaborates on.
  Reference: <https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user>
- `GET /user` — used as the connection-guide probe URL because it
  works for any token regardless of repo permissions.
  Reference: <https://docs.github.com/en/rest/users/users#get-the-authenticated-user>
- `GET /repos/{owner}/{repo}/tarball/{ref?}` — returns the working
  tree as a gzipped tar archive. The clone path uses this rather than
  `git clone` so the same code runs in any Node-compatible runtime
  without spawning `git`.
  Reference: <https://docs.github.com/en/rest/repos/contents#download-a-repository-archive-tar>

The `Authorization: Bearer <PAT>` scheme works for both classic and
fine-grained personal access tokens, which is why the live adapter and
the connection guide both use that header shape.

## CORS / browser constraints

GitHub's REST API does send `Access-Control-Allow-Origin: *` on most
read endpoints, so a browser `fetch()` from a hosted SPA generally
succeeds for unauthenticated calls. Authenticated calls
(`Authorization: Bearer …`) work the same way for personal access
tokens, but require the user to paste their PAT into the SPA. The
local-server fallback is still useful for two reasons:

1. **Tarball download.** The `repos/{owner}/{repo}/tarball` endpoint
   responds with `application/x-gzip` and large response bodies. Even
   though browsers can stream binaries, the SPA does not need a clone
   on disk — it needs the file tree indexed as links. Doing the gzip
   walk on the local server keeps the SPA bundle small and avoids
   shipping a tar parser to the browser.
2. **Rate limits.** Authenticated bulk pulls share the user's 5,000
   req/hour bucket. Routing them through the local server keeps the
   token close to the disk where `wrapSecretStore` already encrypts
   it, and it lets the server batch and resume on failure.

References:

- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS>
- GitHub REST CORS support: <https://docs.github.com/en/rest/overview/resources-in-the-rest-api#cross-origin-resource-sharing>

## Existing libraries surveyed

The relevant ecosystem looks like this:

- **[Octokit](https://github.com/octokit/octokit.js)** —
  GitHub's first-party REST/GraphQL/Webhook SDK. It wraps every endpoint,
  handles pagination, retries, and rate-limit metadata, and ships
  TypeScript types. It is a pretty heavy dependency (multi-package
  monorepo, ~50 KB minified for `@octokit/rest`).
- **[`gh` CLI](https://github.com/cli/cli)** — Go binary, not a
  library. We can invoke it from the local server, but shelling out
  hides the API surface from tests.
- **[isomorphic-git](https://github.com/isomorphic-git/isomorphic-git)**
  — pure-JS git implementation that runs in browsers and Node.
  Excellent if we want a real working copy, but we only need the file
  tree and metadata, not git history.
- **[`simple-git`](https://github.com/steveukx/git-js)** —
  Node-only thin wrapper over the `git` binary; same pros/cons as
  shelling out to `gh`.
- **Native `tar` + zlib** — Node's `zlib.createGunzip()` plus a small
  PAX/USTAR tar reader is enough to walk a tarball entry-by-entry.
  This is what the implementation uses.

The repository's pattern for source adapters (see
[`components.md`](./components.md)) is to keep dependencies on the
platform's built-in primitives so the same code can run in Bun, Node,
Deno, and the browser. We follow that pattern: the GitHub adapter uses
`fetch()` for everything except `cloneRepo`, which uses `node:zlib`
plus a 60-line tar parser. No Octokit dependency is added.

## Personal access tokens

GitHub recommends fine-grained PATs over classic ones for new use cases
(<https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>).
The connection guide does not enforce a token kind because both work
with `Authorization: Bearer …`. The minimum scope needed is:

- **Read access** to issues, pull requests, contents, and metadata
  (covers `parseArchive`, `pullMessages`, `cloneRepo`, `listRepos`).
- **Write access** to issues for `post()` comment creation. The token
  must allow `Issues: write` on every repo the user wants to comment
  in.

## Conclusions

GitHub is a near-perfect fit for the existing `MessageSource`
contract. Issues and PR comments map cleanly onto the
`msg:github:<external_id>` link shape, the REST API is one HTTP +
JSON layer the existing `requestJson()` helper already handles, and
authentication reuses the same `secret:*` link pattern as every other
adapter. Cloning a repo is a different feature (file tree, not chat
stream) and gets its own link prefix `repo:<owner>/<name>` so the
unified inbox does not get polluted with file content. The SPA can run
the read paths directly through `fetch()`; the local server still
exists for tarball ingestion and rate-limit hygiene.
