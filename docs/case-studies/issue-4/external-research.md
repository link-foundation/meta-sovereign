# External Research for Issue #4

The work breaks into three sub-problems:

1. **Talking to Upwork's API** to pull jobs and messages.
2. **Importing Upwork's user-facing exports** so historical data is
   searchable offline.
3. **Staying within Upwork's API ToS** while writing rows into a
   local-first link store.

This file collects the primary sources surveyed and the conclusions
that drove the implementation.

## Upwork API surface (as of May 2026)

Upwork has consolidated on a single public **GraphQL API**. The
legacy v1/v2 REST endpoints are explicitly labelled "sunset /
reference only" by Upwork's migration KB article (published 2023);
the exact REST hard-cutoff date is **unverified** publicly.

- Endpoint: `POST https://api.upwork.com/graphql`
  (JSON body, `Authorization: Bearer <access_token>`).
- Public docs:
  <https://www.upwork.com/developer/documentation/graphql/api/docs/index.html>
  (CDN-gated; reachable in a real browser, returns 403 to non-browser
  fetches).
- Changelog:
  <https://www.upwork.com/developer/documentation/graphql/api/docs/api-changelog.html>.
- Interactive explorer (introspection):
  <https://www.upwork.com/developer/explorer/>.
- Developer portal (app registration):
  <https://www.upwork.com/developer>.

### Relevant operations

The names below are confirmed in community references and the
official Node SDK README; signatures should be verified against the
live introspection schema before relying on production traffic. The
adapter's `OPERATIONS` table includes an explicit `operationOverrides`
escape hatch precisely so an Upwork field rename does not require a
patch release.

- **Job search (public marketplace):** `marketplaceJobPostingsSearch`
  (Connection — `edges { node { … } }`, returns `totalCount`,
  `pageInfo`). Filters via `marketPlaceJobFilter` (search expression,
  category, posted-since); `sortAttributes` for ordering. Confirmed
  in Upwork community thread 1381918 ("Is there a way to search
  through job postings with new GraphQL API").
- **Single posting:** `marketplaceJobPostings` (by id /
  `ciphertext`).
- **Listing my jobs (client side):** Node SDK README lists "Hiring",
  "Job and Freelancer Profile" resources; exact query name
  (`clientJobPostings` / `jobPostings`) is **unverified** publicly
  and must be confirmed via the introspection explorer.
- **Proposals on a job:** confirmed Connection type
  `VendorProposalsConnection` (`pageInfo.endCursor`) — confirmed via
  community discussion of GraphQL pagination.
- **Contracts:** Both client- and freelancer-side contracts are
  exposed (Node SDK "Hiring" + "My Info"). Specific names like
  `freelancerContracts` / `clientContracts` are **unverified** in
  public web results and have to be validated via the explorer.
- **Messaging / Rooms:** Upwork's Node SDK lists a "Messages"
  resource. Legacy REST docs define: list rooms, get room, get
  messages from room, create room, send message to room. The
  GraphQL equivalents are the `rooms`-prefixed connection and a
  `roomsCreateMessage` mutation, but **exact GraphQL field names
  (e.g. `roomsRoomMessages`, `roomsCreateMessage`) are not confirmed
  in public docs** — the adapter ships likely-correct names with an
  override hook.
- **Time logs / weekly diary:** Node SDK names "Time and Financial
  Reporting" and "Work Diary"; GraphQL field names (e.g.
  `workDiaryByCompany`, `timeReportByFreelancer`) are
  **unverified** in public web results.

### OAuth2 flow

- Standard 3-legged authorization-code flow.
- Authorization URL:
  `https://www.upwork.com/ab/account-security/oauth2/authorize`.
- Token URL: `https://www.upwork.com/api/v3/oauth2/token`.
- Required: `client_id`, `client_secret`, `redirect_uri`, `code` —
  exchange for `access_token` + `refresh_token`. Bearer token is
  sent as `Authorization: Bearer <access_token>`.
- Scopes are selected at API-key-request time in the API Center;
  the public list of scope strings is not published, so the adapter
  treats scopes as configured at the registered-app level. The
  **unverified** scope names should be filled in from the developer
  portal once the user provisions an app.
- App registration: log into Upwork → Developer Portal → "Create
  New App" — manual review by Upwork.
- Auth & security KB:
  <https://support.upwork.com/hc/en-us/articles/115015933448>.

### Rate limits & pagination

- Documented practical limit ~**300 requests/minute per IP**;
  over-limit returns HTTP **429**. Per Upwork's API-requests-limits
  KB:
  <https://support.upwork.com/hc/en-us/articles/115015933428>.
- Per-app daily quotas exist but are not publicly enumerated
  (**unverified** in numeric form).
- Pagination: standard Relay-style **cursor connections** —
  `edges { cursor node { … } }` + `pageInfo { hasNextPage,
  endCursor }`; pass `after: endCursor` to advance. The adapter's
  `paginateConnection()` helper follows `hasNextPage` and bounds
  the walk with a configurable `maxPages` (default 50).

### Webhooks / real-time

- Upwork has a **Subscriptions / Webhooks feature**, **client-only**
  (only the buyer/poster, not the freelancer side). Each
  subscription is **manually approved by Upwork** (stays in
  `REVIEW` until then).
- Payload shape is minimal: `{ "entity": "OFFER", "action": "CREATE",
  "id": "…" }` — you must call back into GraphQL to fetch the
  actual record.
- **No streaming / pubsub for new chat messages.** Freelancer-side
  message ingestion has to **poll** the rooms / messages queries.
  The 24-hour soft-cache TTL is therefore a hard floor on freshness
  for the freelancer perspective.

### CORS / browser constraints

Upwork's GraphQL endpoint **does not advertise permissive CORS** for
browser-direct calls (the API is intended for server-side and SDK
consumption). For the SPA path, the local server proxy at
`/api/upwork/*` is the supported route. The CLI and JS server hit
GraphQL directly with no CORS involvement.

References:

- MDN Fetch API: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MDN CORS: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS>
- Upwork developer portal: <https://www.upwork.com/developer>

## Account-level data exports

- **No GDPR self-service ZIP export.** Users submit a DSAR via the
  Privacy Center or `privacyrequests@upwork.com`
  (<https://support.upwork.com/hc/en-us/articles/360001353367>).
  Format is not documented publicly; in practice users receive a
  ZIP with mixed CSV and JSON files. The adapter's `parseArchive`
  accepts the JSON-envelope shape that matches Upwork's documented
  GraphQL field names so the same code can ingest a DSAR JSON or a
  hand-curated archive.
- **Transaction history CSV** (Reports → Transaction History): per
  CSV cap **1,000 rows**, PDF cap 2,000; one year per file; up to
  five years of history retrievable. Columns: transaction date,
  type, description, amount, balance, freelancer name, contract
  details / ID, fees.
  <https://support.upwork.com/hc/en-us/articles/17976724037267>
- **Weekly Summary CSV** (Reports) — freelancer earnings rollups.
- **Work-diary export** is browser-only via "Review work diary"
  UI:
  <https://support.upwork.com/hc/en-us/articles/211062278>.
  The API path is the GraphQL work-diary query, not a packaged
  export. Future work: add a CLI subcommand that wraps the
  GraphQL work-diary query.
- **Bulk invoice download:** small batches return inline; large
  batches are queued and an email link is sent within ~2 hours.

For the messaging hub: account-level "import all" is implemented as
**multiple file imports + paginated GraphQL backfill**, not a single
bundle. The CLI accepts repeated `import --source=upwork --file=…`
calls; each invocation idempotently writes its rows.

## Existing libraries & SDKs

- **`@upwork/node-upwork-oauth2`** — official Node SDK. v2.3.0
  (2024-11-27). Apache-2.0. Covers OAuth2 + helpers for: My Info,
  Hiring, Custom Payments, Job & Freelancer Profile, Search,
  Organization, **Messages**, Time & Financial Reporting,
  Metadata, Snapshot, Team, **Work Diary**, Activities. Repo:
  <https://github.com/upwork/node-upwork-oauth2>. Low repo
  activity (~12 stars) — thin wrapper over GraphQL HTTP, fine for
  token plumbing; we mostly hand-roll GraphQL queries.
- **`python-upwork-oauth2`** — official Python SDK. v3.1.0
  (2023-06-22). Apache-2.0. README states "supports all GraphQL
  calls publicly shared at Upwork." Repo:
  <https://github.com/upwork/python-upwork-oauth2>.
- **Legacy `node-upwork` / `python-upwork`** (OAuth1) — abandoned,
  do not use.
- **Third-party**: `@chinchillaenterprises/mcp-upwork` (npm, MCP
  server wrapper around the GraphQL API) exists but is unofficial
  and small-scale; useful as reference, not a dependency.

The repository's pattern for source adapters (see
[`components.md`](./components.md)) is to keep dependencies on the
platform's built-in primitives so the same code can run in Bun,
Node, Deno, and the browser. We follow that pattern: the Upwork
adapter uses `fetch()` for everything.

## Existing unified-inbox integrations

- **No first-party Upwork bridge in Beeper / Matrix / Mattermost** as
  of search date. Beeper's bridges target consumer chat networks;
  Upwork is not in the supported set.
- Third-party Upwork "alert" tools (UpHunt, Vibeworker, GigRadar)
  exist for job-posting notifications, not for ingesting full DM
  threads.

Net: this integration is net-new in the open-source ecosystem; no
prototype to fork. The closest reference for shape is the GitHub
adapter we just shipped under issue #5.

## Legal / ToS

This is the most constraining finding. Per Upwork's API ToS
(<https://developers.upwork.com/api-tos.html>, redirects to the dev
portal but the text is reproduced in Upwork KB articles):

- **No persistent caching of Upwork Content beyond ~24 hours.**
  "Developer may not copy or store any Upwork Content, or any
  information expressed by or representing Upwork Content (such as
  hashed or otherwise transformed data), except as specifically
  permitted." Common SDK guidance frames the permitted window as
  **up to 24 hours** for performance caching.
- Permitted to store: Upwork-issued user IDs, OAuth tokens.
- **Mandatory deletion on user request** (and account deletion).
- API use is restricted to "facilitating your own or your Users'
  use of the Upwork Site and Site Services" — i.e., redistribution
  / public mirrors are out.

**Implication for the local-first hub:**

- The "links data store" mirror of Upwork content is only
  ToS-clean as a **per-user, on-device cache** with a documented
  **TTL ≤ 24h** for pulled content (or shorter), and a
  **delete-on-revoke / delete-on-request** path.
- User-supplied CSV / DSAR exports stand on different ground (the
  user owns the data they exported); these can be retained per the
  user's wishes.
- The `msg:upwork:<external_id>` link shape is fine; treat the
  live-API-derived payload as soft cache (refresh ≤ 24h) and treat
  user-imported export rows as authoritative durable records.

The adapter implements this distinction by stamping every live link
with `softCache: true, cacheTtlMs: 86_400_000`, and exposing
`softCacheRetention()` which the CLI / server call before each
pull.

## Items flagged unverified (need explorer confirmation before coding)

- Exact GraphQL field names for: client's own job postings,
  contracts (`freelancerContracts` / `clientContracts`), rooms list,
  room messages, send-message mutation, work-diary, time-report,
  weekly-summary.
- Exact OAuth scope strings.
- Exact REST sunset date.
- Per-app daily quota numbers.

The adapter ships likely-correct defaults plus an
`operationOverrides` escape hatch so a single-line override can fix
any incorrect default without a release.

## Source URLs

- <https://www.upwork.com/developer>
- <https://www.upwork.com/developer/documentation/graphql/api/docs/index.html>
- <https://www.upwork.com/developer/documentation/graphql/api/docs/api-changelog.html>
- <https://www.upwork.com/developer/explorer/>
- <https://support.upwork.com/hc/en-us/articles/16390572203155-Migration-to-GraphQL-API>
- <https://support.upwork.com/hc/en-us/articles/115015933448-API-authentication-and-security>
- <https://support.upwork.com/hc/en-us/articles/115015933428-API-requests-limits>
- <https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork>
- <https://support.upwork.com/hc/en-us/articles/17976724037267-Download-invoices-and-transaction-reports>
- <https://support.upwork.com/hc/en-us/articles/211062278-How-to-review-your-freelancer-s-work-diary-on-Upwork>
- <https://support.upwork.com/hc/en-us/articles/360001353367-EU-GDPR-Compliance>
- <https://developers.upwork.com/api-tos.html>
- <https://github.com/upwork/node-upwork-oauth2>
- <https://github.com/upwork/python-upwork-oauth2>
- <https://www.npmjs.com/package/@upwork/node-upwork-oauth2>
- <https://community.upwork.com/t5/Support-Forum/Is-there-a-way-to-search-through-job-postings-with-new-GraphQL/td-p/1381918>
- <https://community.upwork.com/t5/Coffee-Break/Upwork-Api-Webhooks/m-p/907996>
