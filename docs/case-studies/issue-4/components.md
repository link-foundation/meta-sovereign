# Components and Libraries Survey

## Existing components reused

The repository already provides a small framework for adding a new
external network. The Upwork adapter slots into it without bespoke
plumbing:

- `MessageSource` registry in
  [`js/src/sources/index.js`](../../../js/src/sources/index.js)
  registers the new adapter and exposes `parseArchive`, `live`,
  `importInto`, and `pullLiveInto` semantics.
- [`buildMessageLink()`](../../../js/src/sources/link.js) produces the
  normalized `msg:<source>:<external_id>` link shape every adapter
  uses.
- [`requestJson()` and `authHeaders()`](../../../js/src/sources/http.js)
  give us a `fetch()`-based JSON client with `Authorization: Bearer`
  support, environment-variable token resolution
  (`resolveOption(envValue('UPWORK_TOKEN'))`), and a uniform error
  shape.
- [`stampSourceLink()`](../../../js/src/sources/index.js) stamps every
  imported link with `handled.by = source:upwork:live` so the
  existing CRM and operator views surface Upwork messages in the
  same queue as Telegram, VK, GitHub, and email.
- [`wrapSecretStore`](../../../js/src/storage/secret-store.js)
  encrypts every `secret:*` link at rest with AES-256-GCM. The
  Upwork OAuth access token lands at `secret:upwork:access-token`
  and the refresh token at `secret:upwork:refresh-token`; both are
  covered automatically.
- The connection-guide registry in
  [`js/src/web/connection-guides.js`](../../../js/src/web/connection-guides.js)
  controls how the SPA renders archive uploaders, credential fields,
  probe URLs, and CORS-classification messages. Adding Upwork is a
  data-only change.
- The CLI in [`js/src/cli/index.js`](../../../js/src/cli/index.js)
  already routes `source-pull --source=<name>` through
  `pullLiveInto()`, so registering `upwork` in the source map is
  enough to expose the live pull path. The new search and message
  flows follow the existing `email-send` / `github-comment` shape.
- The HTTP server in [`js/src/server/`](../../../js/src/server/) is
  modular: `routes-mutating.js` already handles `/api/email/pull`,
  `/api/github/pull`, etc. The new `/api/upwork/pull`,
  `/api/upwork/search`, and `/api/upwork/post-message` routes follow
  the same dispatch pattern.

## New components added in PR #23

- [`js/src/sources/upwork.js`](../../../js/src/sources/upwork.js) —
  archive parser plus
  `createUpworkLive({ token, fetchImpl, baseUrl, organizationId, operationOverrides })`
  with `searchJobs`, `pullMessages`, `listContracts`, `post`, and
  the `softCacheRetention()` helper. The file is dependency-free
  and runs unchanged in Bun, Node, Deno, and the browser.
- A small Relay-style cursor-pagination helper local to the file
  (`paginateConnection(fetchImpl, query, variables, picker)`) that
  walks a GraphQL connection until `pageInfo.hasNextPage === false`.
- A regex-free CSV row splitter that respects quoted commas, used
  only by `parseArchive` when the input is a string.
- A small operation registry (`OPERATIONS`) keyed by query name so
  every GraphQL string is in one place and easy to override per
  call. Defaults document the **likely** Upwork field names; the
  `operationOverrides` parameter on `createUpworkLive` lets users
  override any operation without forking the adapter (necessary
  because Upwork's docs portal is gated and several field names
  remain **unverified** publicly).

## External libraries considered but not added

- **[`@upwork/node-upwork-oauth2`](https://www.npmjs.com/package/@upwork/node-upwork-oauth2)**.
  Apache-2.0, last release 2.3.0 (2024-11-27). Official Upwork SDK,
  thin wrapper over OAuth2 + GraphQL HTTP. Supports the same
  resources we need (Messages, Hiring, Custom Payments, Search,
  Time and Financial Reporting, Work Diary). Adding it would inflate
  the dependency tree to satisfy something `requestJson()` already
  does in three lines. Not adopted — re-documented here as a
  reference for future contributors who need the full OAuth refresh
  dance.
- **[`python-upwork-oauth2`](https://github.com/upwork/python-upwork-oauth2)**.
  Apache-2.0, last release 3.1.0 (2023-06-22). Python equivalent of
  the Node SDK; useful as a schema reference but irrelevant to the
  JS adapter.
- **`@chinchillaenterprises/mcp-upwork`**. Third-party MCP server
  wrapping Upwork's GraphQL API. Useful as schema reference, but
  unmaintained and not a runtime dependency we need.
- **Octokit-style hand-roll** (separate package per resource). The
  whole Upwork surface we exercise is ten or so GraphQL
  operations; splitting them into packages adds maintenance burden
  without benefit.
- **CSV libraries (`csv-parse`, `papaparse`)**. The Upwork CSV
  surface is small (transaction history, weekly summary) and uses a
  single quoted-comma dialect; the inline splitter avoids adding a
  parser dependency.
- **GraphQL client libraries (`graphql-request`, `urql`, Apollo
  Client)**. The same calls fit comfortably in plain `fetch()`
  through `requestJson()`, so we do not pay the dependency cost.

## Test framework reuse

- Uses [`test-anywhere`](https://github.com/link-foundation/test-anywhere)
  via `node --test` / `bun test`, like every other source adapter
  test in `js/tests/`.
- Mocks `fetchImpl` with the same lightweight stub helper pattern
  used in `live-connectors.test.js` and `github-source.test.js` (no
  nock, no MSW, no network).
- Uses an in-memory `createMemoryStore()` from `js/src/storage/` so
  the end-to-end "fetch → parse → store" path runs without disk
  I/O.
- Asserts the GraphQL bodies sent by the live adapter match the
  expected operations so the **unverified** Upwork field names are
  pinned by the test fixtures and any future change is loud.
