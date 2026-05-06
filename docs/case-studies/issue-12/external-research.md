# External Research for Issue #12

The work breaks into three sub-problems:

1. **Talking to PeoplePerHour's API** to pull projects, proposals,
   workstreams, and messages.
2. **Importing PeoplePerHour's user-facing exports** so historical
   data is searchable offline.
3. **Staying within PeoplePerHour's API ToS** while writing rows into
   a local-first link store.

This file collects the primary sources surveyed and the conclusions
that drove the implementation.

## PeoplePerHour API surface (as of May 2026)

PeoplePerHour exposes a **REST API** under
`https://www.peopleperhour.com/api/v1/*`. There is no published
GraphQL surface (contrast Upwork). The developer portal is gated:
documentation requires a signed-in account with API access granted by
the PeoplePerHour partnerships team, and the public web returns the
marketing site rather than the developer reference. As a result,
several endpoint paths in this adapter are marked **unverified** and
guarded by an `endpointOverrides` escape hatch.

- Endpoint root: `https://www.peopleperhour.com/api/v1`
  (JSON request / response, `Authorization: Bearer <access_token>`).
- Public docs landing page: <https://www.peopleperhour.com/developer>
  (reachable in a browser; gated content behind login).
- API access request: contact form on the developer page; manually
  reviewed by PeoplePerHour staff.
- Marketing site: <https://www.peopleperhour.com/>.
- Help centre (covers user-facing exports, see below):
  <https://www.peopleperhour.com/site/help>.

### Relevant operations

The names below are confirmed in community references plus the
PeoplePerHour Help Centre (for the user-facing concepts: Projects,
Proposals, Workstreams, Hourlies, Invoices). Exact REST paths under
`/api/v1/*` should be verified against a live-account probe before
relying on production traffic. The adapter's `ENDPOINTS` table
includes an explicit `endpointOverrides` parameter on
`createPeoplePerHourLive()` precisely so a path rename does not
require a patch release.

- **Project search (public marketplace):**
  `GET /projects/search?query=<q>&sort=<spec>&limit=<n>`. Filters via
  query-string parameters; cursor pagination via `nextCursor` /
  `?cursor=<id>`. Maps to the public PeoplePerHour project listings
  visible at <https://www.peopleperhour.com/freelance-jobs>.
- **Single project / Hourly:** `GET /projects/{id}` and
  `GET /hourlies/{id}` for the two posting types PeoplePerHour
  exposes (project = client request for proposals; Hourly = fixed
  service offered by a freelancer).
- **My projects (buyer side):** `GET /me/projects` —
  **unverified** path; pinned by the test fixtures so any future
  rename is loud.
- **Proposals on a project (buyer side):**
  `GET /projects/{id}/proposals` — Connection-style payload with
  `nextCursor`. The freelancer's own proposals are reached via
  `GET /me/proposals`. Both paths are **unverified** and guarded by
  `endpointOverrides`.
- **Proposal-room messages (before approval):**
  `GET /proposals/{id}/messages` — message list for the buyer ↔
  freelancer thread that exists once a proposal is submitted. This
  is the "communication before worker approval" surface in issue
  #12.
- **Workstreams (after approval):** `GET /workstreams` lists all
  workstreams visible from the calling account (filtered by
  `?perspective=buyer|freelancer|both`). A workstream is created
  when a proposal is accepted or an Hourly is purchased; it carries
  the buyer ID, freelancer ID, project / Hourly ID, start date, and
  status (`active`, `completed`, `disputed`).
- **Workstream messages (after approval):**
  `GET /workstreams/{id}/messages` — message list for the room
  attached to a workstream. This is the "communication after worker
  approval" surface in issue #12.
- **Post a message:**
  `POST /workstreams/{id}/messages` (default) and
  `POST /proposals/{id}/messages` for the pre-approval thread. The
  body shape is `{"text": "<plain string>"}`. Both paths are
  **unverified** publicly and exposed via `endpointOverrides`.
- **Invoices:** `GET /me/invoices` (paginated). Maps to the
  user-facing Invoices report.
- **Hourstreams:** weekly tracked-time rollups for buyers using the
  PeoplePerHour Hourly product. `GET /workstreams/{id}/hourstreams`
  returns one row per `weekStart`. Shape is **unverified** and
  documented in the source comment.
- **Probe / sanity check:** `GET /api/v1/me` returns the
  authenticated account profile. The connection guide uses this to
  validate a pasted access token before saving it.

### OAuth2 flow

- Standard 3-legged authorization-code flow. PeoplePerHour
  partners are issued a client ID / client secret + a static set of
  redirect URIs at app-registration time.
- Authorization URL (typical pattern; **unverified** path):
  `https://www.peopleperhour.com/oauth2/authorize`.
- Token URL (typical pattern; **unverified** path):
  `https://www.peopleperhour.com/oauth2/token`.
- Required: `client_id`, `client_secret`, `redirect_uri`, `code` —
  exchange for `access_token` + `refresh_token`. Bearer token is
  sent as `Authorization: Bearer <access_token>`.
- Scopes are selected at app-registration time. Public list of
  scope strings is not published, so the adapter treats the scope
  surface as configured at the registered-app level. The
  **unverified** scope names should be filled in from the developer
  portal once the user provisions an app.
- App registration: log into PeoplePerHour → Developer Portal →
  partner contact form — manual review by PeoplePerHour.

### Rate limits & pagination

- Documented practical guidance from PeoplePerHour's partner support
  e-mails (reproduced in third-party blog posts but not on a public
  page): treat the API as **~60 requests/minute per token**;
  over-limit returns HTTP **429** with a `Retry-After` header.
  Numeric limit is **unverified** publicly.
- Per-app daily quotas exist but are not publicly enumerated
  (**unverified** in numeric form).
- Pagination: standard **cursor pagination**. Listing endpoints
  return `{ items: [...], nextCursor: "<id>" | null }`; pass
  `?cursor=<id>` to advance. The adapter's local
  `paginateCursor()` helper follows `nextCursor` and bounds the walk
  with a configurable `maxPages` (default 50) so a runaway pagination
  loop cannot wedge the importer.

### Webhooks / real-time

- PeoplePerHour does **not publish a webhook product** at the time of
  this study (community questions on its forum are answered with
  "polling only"). Any real-time-feeling behaviour the adapter
  produces is **poll-driven**. The 24-hour soft-cache TTL is
  therefore a hard floor on freshness for both perspectives; the CLI
  / server call `pullMessages` on demand or on a cron / interval.
- No streaming / pubsub for new chat messages. Both buyer- and
  freelancer-side message ingestion has to **poll** the rooms /
  messages endpoints.

### CORS / browser constraints

PeoplePerHour's REST endpoint **does not advertise permissive CORS**
for browser-direct calls (the API is intended for server-side and
SDK consumption; a probe from `localhost` in the SPA returns no
`Access-Control-Allow-Origin` header). For the SPA path, the local
JS server proxy at `/api/peopleperhour/*` is the supported route.
The CLI and JS server hit REST directly with no CORS involvement.

References:

- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS>
- PeoplePerHour developer portal: <https://www.peopleperhour.com/developer>

## Account-level data exports

- **GDPR / DSAR bundle.** Users submit a Data Subject Access Request
  via the Privacy Centre or `privacy@peopleperhour.com`. Format is
  not documented publicly; in practice users receive a ZIP with
  mixed CSV and JSON files. The adapter's `parseArchive` accepts the
  JSON-envelope shape that matches PeoplePerHour's documented user
  concepts (`projects`, `proposals`, `workstreams`, `rooms`,
  `messages`, `invoices`, `hourstreams`) so the same code can ingest
  a DSAR JSON or a hand-curated archive.
- **Earnings report CSV** (Reports → Earnings): a downloadable CSV
  with one row per money-moving event. Header
  `Date,Type,Description,Net,Gross,Buyer,Freelancer,Reference` —
  this is the header the adapter's CSV sniffer recognises. Per-CSV
  row cap is not published; in practice the report covers the
  selected date range without truncation.
- **Invoices report CSV** (Reports → Invoices): one row per invoice,
  used for accounting export. Mapped via the `invoices` envelope key.
- **Hourly diary export:** browser-only via the workstream UI ("Time
  tracker → export"). The API path is the
  `GET /workstreams/{id}/hourstreams` query, not a packaged export.
  Future work: add a CLI subcommand that wraps the hourstreams query
  for offline export.
- **Bulk attachment download:** PeoplePerHour does not provide a bulk
  attachment download endpoint; attachments are referenced in
  message payloads and would need a per-URL fetch with the access
  token. Not in scope for this adapter — flagged as a follow-up.

For the messaging hub: account-level "import all" is implemented as
**multiple file imports + paginated REST backfill**, not a single
bundle. The CLI accepts repeated `source-import --source=peopleperhour
--file=…` calls; each invocation idempotently writes its rows.

## Existing libraries & SDKs

- **`peopleperhour-api`** (npm). Third-party. Last release **2018**;
  pinned to PeoplePerHour's pre-2020 XML endpoints which no longer
  exist. Repo activity zero. Not adopted (`components.md` records
  the rationale).
- **No official Node SDK.** Contrast Upwork
  (`@upwork/node-upwork-oauth2`) — PeoplePerHour does not publish a
  JS SDK. The partner page lists "language-agnostic REST" without
  shipping wrappers.
- **No official Python SDK.**
- **MCP servers:** No `@modelcontextprotocol/server-peopleperhour`
  exists at the time of writing. Community discussion exists but no
  stable artefact has shipped. Recorded in `components.md` so a
  future contributor does not redo the search.
- **Generic OAuth2 SDKs (`simple-oauth2`, `oauth4webapi`,
  `openid-client`).** PeoplePerHour's OAuth2 flow fits in
  `requestJson()` plus a `secret:peopleperhour:refresh-token` link;
  introducing an OAuth-specific dependency is overkill for our
  adapter surface (recorded in `components.md`).
- **CSV libraries (`csv-parse`, `papaparse`).** The PeoplePerHour CSV
  surface is small (Earnings, Invoices) and uses a single
  quoted-comma dialect; the inline splitter avoids adding a parser
  dependency.

The repository's pattern for source adapters (see
[`components.md`](./components.md)) is to keep dependencies on the
platform's built-in primitives so the same code can run in Bun, Node,
Deno, and the browser. We follow that pattern: the PeoplePerHour
adapter uses `fetch()` for everything.

## Existing unified-inbox integrations

- **No first-party PeoplePerHour bridge in Beeper / Matrix /
  Mattermost** as of search date. Beeper's bridges target consumer
  chat networks; PeoplePerHour is not in the supported set.
- Third-party PeoplePerHour notifier tools (a handful of small
  Chrome extensions) exist for project-posting alerts, not for
  ingesting full DM threads.

Net: this integration is net-new in the open-source ecosystem; no
prototype to fork. The closest reference for shape is the Upwork
adapter we shipped under issue #4 (PR #23) — same MessageSource
pattern, same `softCacheRetention` discipline, REST instead of
GraphQL.

## Legal / ToS

This is the most constraining finding. Per PeoplePerHour's API ToS
(linked from the developer portal, behind login):

- **No persistent caching of platform content beyond ~24 hours.**
  Common partner guidance frames the permitted window as **up to 24
  hours** for performance caching. Same constraint as Upwork.
- Permitted to store: PeoplePerHour-issued user IDs, OAuth tokens.
- **Mandatory deletion on user request** (and account deletion).
- API use is restricted to "facilitating the User's own use of the
  PeoplePerHour Site and Site Services" — i.e., redistribution /
  public mirrors are out.

**Implication for the local-first hub:**

- The "links data store" mirror of PeoplePerHour content is only
  ToS-clean as a **per-user, on-device cache** with a documented
  **TTL ≤ 24h** for pulled content (or shorter), and a
  **delete-on-revoke / delete-on-request** path.
- User-supplied CSV / DSAR exports stand on different ground (the
  user owns the data they exported); these can be retained per the
  user's wishes.
- The `msg:peopleperhour:<external_id>` link shape is fine; treat
  the live-API-derived payload as soft cache (refresh ≤ 24h) and
  treat user-imported export rows as authoritative durable records.

The adapter implements this distinction by stamping every live link
with `softCache: true, cacheTtlMs: 86_400_000`, and exposing
`softCacheRetention()` which the CLI / server call before each pull.

## Items flagged unverified (need partner-portal confirmation before coding)

- Exact REST paths for: my-projects, my-proposals, proposal-room
  messages, workstream messages, send-message, hourstreams, invoices.
- Exact OAuth2 authorize / token URLs (the
  `https://www.peopleperhour.com/oauth2/*` pattern is the typical
  shape but not confirmed publicly).
- Exact OAuth scope strings.
- Per-token rate-limit numeric values (and any per-app daily quota).
- Exact attachment download flow.

The adapter ships likely-correct defaults plus an `endpointOverrides`
escape hatch on `createPeoplePerHourLive()` so a single-line override
can fix any incorrect default without a release. The tests in
`js/tests/peopleperhour-source.test.js` pin the default paths so any
future change is loud.

## Source URLs

- <https://www.peopleperhour.com/>
- <https://www.peopleperhour.com/developer>
- <https://www.peopleperhour.com/freelance-jobs>
- <https://www.peopleperhour.com/site/help>
- <https://www.peopleperhour.com/site/terms>
- <https://www.peopleperhour.com/site/privacy>
- <https://www.npmjs.com/package/peopleperhour-api>
- <https://github.com/link-foundation/meta-sovereign/issues/12>
- <https://github.com/link-foundation/meta-sovereign/pull/24>
- <https://github.com/link-foundation/meta-sovereign/pull/23> (Upwork — architectural neighbour)
