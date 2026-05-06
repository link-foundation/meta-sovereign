# Components and Libraries Survey

## Existing components reused

The repository already provides a small framework for adding a new
external network. The PeoplePerHour adapter slots into it without
bespoke plumbing:

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
  (`resolveOption(envValue('PEOPLEPERHOUR_TOKEN'))`), and a uniform
  error shape.
- [`stampSourceLink()`](../../../js/src/sources/index.js) stamps every
  imported link with `handled.by = source:peopleperhour:live` so the
  existing CRM and operator views surface PeoplePerHour messages in
  the same queue as Telegram, VK, GitHub, Upwork, and email.
- [`wrapSecretStore`](../../../js/src/storage/secret-store.js)
  encrypts every `secret:*` link at rest with AES-256-GCM. The
  PeoplePerHour OAuth access token lands at
  `secret:peopleperhour:access-token` and the refresh token at
  `secret:peopleperhour:refresh-token`; both are covered
  automatically.
- The connection-guide registry in
  [`js/src/web/connection-guides.js`](../../../js/src/web/connection-guides.js)
  controls how the SPA renders archive uploaders, credential fields,
  probe URLs, and CORS-classification messages. Adding PeoplePerHour
  is a data-only change.
- The CLI in [`js/src/cli/index.js`](../../../js/src/cli/index.js)
  already routes `source-pull --source=<name>` through
  `pullLiveInto()`, so registering `peopleperhour` in the source map
  is enough to expose the live pull path. The new search and message
  flows follow the existing `email-send` / `github-comment` /
  `upwork-search` shape.
- The HTTP server in [`js/src/server/`](../../../js/src/server/) is
  modular: `routes-mutating.js` already handles `/api/email/pull`,
  `/api/github/pull`, `/api/upwork/pull`, etc. The new
  `/api/peopleperhour/pull`, `/api/peopleperhour/search`, and
  `/api/peopleperhour/post-message` routes follow the same dispatch
  pattern.

## New components added in PR #24

- [`js/src/sources/peopleperhour.js`](../../../js/src/sources/peopleperhour.js) —
  archive parser plus
  `createPeoplePerHourLive({ token, fetchImpl, baseUrl, endpointOverrides })`
  with `searchProjects`, `pullMessages`, `listWorkstreams`, `post`,
  and the `softCacheRetention()` helper. The file is
  dependency-free and runs unchanged in Bun, Node, Deno, and the
  browser.
- A small cursor-pagination helper local to the file
  (`paginateCursor(fetchImpl, request, picker)`) that walks the
  REST endpoint until the API stops returning a `nextCursor`.
- A regex-free CSV row splitter that respects quoted commas, used
  only by `parseArchive` when the input is a string. It is the same
  pattern as the Upwork transaction CSV splitter.
- A small endpoint registry (`ENDPOINTS`) keyed by operation name so
  every REST path is in one place and easy to override per call.
  Defaults document the **likely** PeoplePerHour paths; the
  `endpointOverrides` parameter on `createPeoplePerHourLive` lets
  users override any operation without forking the adapter
  (necessary because PeoplePerHour's developer portal is gated and
  several paths remain **unverified** publicly).

## External libraries considered but not added

- **`peopleperhour-api`** (a third-party npm package). Unmaintained,
  last release 2018, focuses on legacy XML endpoints that no longer
  exist. Not adopted.
- **Generic OAuth2 SDKs (`simple-oauth2`, `oauth4webapi`)**.
  PeoplePerHour's OAuth flow fits in `requestJson()` plus a
  `secret:peopleperhour:refresh-token` link; introducing an
  OAuth-specific dependency is overkill for our adapter surface.
- **`@modelcontextprotocol/server-peopleperhour`**. No such MCP
  server exists at the time of writing — there is community
  discussion but no stable artefact. Tracked here so a future
  contributor does not re-do the search.
- **CSV libraries (`csv-parse`, `papaparse`)**. The PeoplePerHour
  CSV surface is small (Earnings, Invoices) and uses a single
  quoted-comma dialect; the inline splitter avoids adding a parser
  dependency.
- **REST client libraries (`axios`, `got`, `ky`)**. The same calls
  fit comfortably in plain `fetch()` through `requestJson()`, so we
  do not pay the dependency cost.

## Test framework reuse

- Uses [`test-anywhere`](https://github.com/link-foundation/test-anywhere)
  via `node --test` / `bun test`, like every other source adapter
  test in `js/tests/`.
- Mocks `fetchImpl` with the same lightweight stub helper pattern
  used in `live-connectors.test.js`, `github-source.test.js`, and
  `upwork-source.test.js` (no nock, no MSW, no network).
- Uses an in-memory `createMemoryStore()` from `js/src/storage/` so
  the end-to-end "fetch → parse → store" path runs without disk
  I/O.
- Asserts the REST bodies sent by the live adapter match the
  expected endpoints so the **unverified** PeoplePerHour paths are
  pinned by the test fixtures and any future change is loud.
