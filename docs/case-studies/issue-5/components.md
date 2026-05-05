# Components and Libraries Survey

## Existing components reused

The repository already provides a small framework for adding a new
external network. The GitHub adapter slots into it without bespoke
plumbing:

- `MessageSource` registry in [`js/src/sources/index.js`](../../../js/src/sources/index.js)
  registers the new adapter and exposes `parseArchive`, `live`,
  `importInto`, and `pullLiveInto` semantics.
- [`buildMessageLink()`](../../../js/src/sources/link.js) produces the
  normalized `msg:<source>:<external_id>` link shape every adapter
  uses.
- [`requestJson()` and `authHeaders()`](../../../js/src/sources/http.js)
  give us a `fetch()`-based JSON client with `Authorization: Bearer`
  support, environment-variable token resolution
  (`resolveOption(envValue('GITHUB_TOKEN'))`), and a uniform error
  shape.
- [`stampSourceLink()`](../../../js/src/sources/index.js) stamps every
  imported link with `handled.by = source:github:live` so the existing
  CRM and operator views surface GitHub comments in the same queue as
  Telegram, VK, and email.
- [`wrapSecretStore`](../../../js/src/storage/secret-store.js)
  encrypts every `secret:*` link at rest with AES-256-GCM. The GitHub
  PAT lands at `secret:github:access-token` and is therefore covered
  for free.
- The connection-guide registry in
  [`js/src/web/connection-guides.js`](../../../js/src/web/connection-guides.js)
  controls how the SPA renders archive uploaders, credential fields,
  probe URLs, and CORS-classification messages. Adding GitHub is a
  data-only change.
- The CLI in [`js/src/cli/index.js`](../../../js/src/cli/index.js)
  already routes `source-pull --source=<name>` through
  `pullLiveInto()`, so registering `github` in the source map is
  enough to expose the live pull path. The new clone and post flows
  follow the existing `email-send` shape.
- The HTTP server in [`js/src/server/`](../../../js/src/server/) is
  modular: `routes-mutating.js` already handles `/api/email/pull`
  and `/api/email/send`. The new `/api/github/pull`,
  `/api/github/clone`, and `/api/github/post-comment` routes follow
  the same dispatch pattern.

## New components added in PR #22

- [`js/src/sources/github.js`](../../../js/src/sources/github.js) —
  archive parser plus `createGithubLive({ token, owner, repo, fetchImpl, baseUrl })`
  with `pullMessages`, `listRepos`, `cloneRepo`, and `post`.
- A small tar+gzip reader inside `github.js`. The reader is local to
  the file (no new dependency), runs only on Node-capable runtimes,
  and decodes 512-byte USTAR/PAX blocks into `{ name, size, body }`
  entries. The browser bundle does not import it because the SPA does
  not need to walk tarballs locally.
- A regex-free `paginate()` helper that walks the `Link` response
  header to collect all pages of a paginated GitHub query. The helper
  is exported for `pullMessages`, `listRepos`, and the
  comments/reviews endpoints.

## External libraries considered but not added

- **[`@octokit/rest`](https://www.npmjs.com/package/@octokit/rest)**
  and **[`octokit`](https://www.npmjs.com/package/octokit)**.
  Comprehensive, but the dependency surface is large for a project
  that intentionally keeps the SPA bundle minimal and reuses the same
  source code in three runtimes plus the browser. The same nine REST
  calls fit comfortably in 200 lines of `fetch()` code.
- **[`isomorphic-git`](https://www.npmjs.com/package/isomorphic-git)**.
  Useful when the goal is a true working copy with history. The
  directive in issue #5 is "download all our repositories locally and
  index them in links store" — a flat file index is enough, and the
  tarball endpoint delivers that without a git checkout.
- **[`tar`](https://www.npmjs.com/package/tar)** /
  **[`tar-stream`](https://www.npmjs.com/package/tar-stream)**.
  Solid Node-only tar libraries, but adding either to a multi-runtime
  package complicates Bun/Deno parity. The internal reader covers our
  scope (read tar entries, ignore long-name PAX extensions by reading
  through them), and is fenced behind `cloneRepo()` so the SPA bundle
  never touches it.
- **[`simple-git`](https://www.npmjs.com/package/simple-git)** /
  shelling out to `git` or `gh`. Both hide the API surface from
  unit tests and make the server depend on a binary we cannot ship in
  the npm package.

## Test framework reuse

- Uses [`test-anywhere`](https://github.com/link-foundation/test-anywhere)
  via `node --test` / `bun test`, like every other source adapter
  test in `js/tests/`.
- Mocks `fetchImpl` with the same lightweight stub helper pattern used
  in `live-connectors.test.js` (no nock, no MSW, no network).
- Uses an in-memory `createMemoryStore()` from `js/src/storage/` so the
  end-to-end "fetch → parse → store" path runs without disk I/O.
