# Case Study: Issue #4 — Add Upwork support

**Issue:** [#4 — Add upwork support](https://github.com/link-foundation/meta-sovereign/issues/4)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-4-30c7e8dd5217`
**Pull Request:** [#23](https://github.com/link-foundation/meta-sovereign/pull/23)

This case study collects every directive from issue #4, decomposes it
into atomic requirements (`R-S*`), records the prior art and tooling
surveyed, and lays out the solution plan that PR #23 implements
against the existing local-first / privacy-first design constraints
already established in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md)
and the GitHub case study under
[`docs/case-studies/issue-5/`](../issue-5/README.md).

The artefacts in this folder are:

| File                   | Purpose                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                                                                          |
| `requirements.md`      | Atomic requirement list (`R-S*`) extracted from the issue.                                                                                    |
| `solution-plan.md`     | Phased plan mapping each requirement to a concrete deliverable in PR #23.                                                                     |
| `components.md`        | Catalogue of upstream tooling and standards consulted, plus the components reused from this repository.                                       |
| `external-research.md` | Summary of external research about the Upwork GraphQL API, OAuth2 flow, data-export options, ToS caching constraints, and existing libraries. |
| `data/`                | Raw artefacts (`issue.json`, `comments.json`) used to build this study.                                                                       |

---

## 1. Vision (paraphrased from the issue)

The reporter asks the project to support **task / job communication on
Upwork** — both **before** the worker is approved (job postings,
proposal threads) and **after** they are hired (contract rooms,
hourly diaries) — and to do it **from both perspectives**: the
**task giver (client)** posting work and the **task taker
(freelancer)** delivering it. All of the resulting data needs to live
in the project's links data store, and the user must also be able to
**import their account-level Upwork data exports** so historical
threads are searchable offline.

The case study itself is a deliverable: the issue insists on a
`docs/case-studies/issue-4/` folder with deep analysis, online
research, an explicit requirement list, a per-requirement solution
plan, and a survey of existing components or libraries. Everything
must land in a single PR that iterates until each requirement is
fully addressed.

The directive sits across three of the project's existing pillars:

- **Unified inbox.** Upwork becomes the twelfth `MessageSource`
  alongside email, Telegram, VK, X, WhatsApp, Facebook, LinkedIn,
  career.habr.com, hh.ru, superjob.ru, and GitHub. Proposal threads
  and contract rooms are conversational and map onto
  `msg:upwork:<external_id>` via
  [`buildMessageLink()`](../../../js/src/sources/link.js).
- **Job-board parity.** Upwork joins habr-career, hh.ru, and
  superjob.ru in the "job-board adapter" cluster. Like those
  adapters, it surfaces both the postings and the chat about them.
- **Repository-as-data.** Where the GitHub adapter writes file links
  under `repo:<owner>/<name>:*`, the Upwork adapter writes
  `job:upwork:<id>`, `proposal:upwork:<id>`, `contract:upwork:<id>`,
  `room:upwork:<id>`, `transaction:upwork:<id>`, and
  `timelog:upwork:<contract>:<weekStart>` so the CRM can group threads
  by job, contract, or week without re-walking message bodies.

## 2. Decomposed requirements

Twenty-two atomic requirements (`R-S1..R-S22`) come out of the issue.
The full list — with the implementation status for each — lives in
[`requirements.md`](./requirements.md). At a glance:

- **R-S1..R-S2** — the source itself: register Upwork in the
  `MessageSource` registry and accept its archive shapes.
- **R-S3..R-S8** — live GraphQL pulls (job search, proposal-room
  messages, contract-room messages, both perspectives, post a
  reply).
- **R-S9..R-S11** — account-level data import, plus dedicated link
  kinds for jobs and contracts so reports can join across them.
- **R-S12** — explicit alignment with Upwork's API ToS: live data
  is treated as a 24-hour soft cache; user-supplied export rows are
  durable.
- **R-S13..R-S16** — CLI / server / SPA / secret-store surfaces.
- **R-S17..R-S22** — the case-study artefacts, library survey,
  reproducing tests, top-level docs, and the single-PR delivery rule.

## 3. Solution overview

The implementation lives almost entirely in
[`js/src/sources/upwork.js`](../../../js/src/sources/upwork.js):

- `upworkSource.parseArchive(input)` accepts:
  - an **array** of GraphQL nodes / payloads — auto-classified as
    job / proposal / contract / room / message / transaction;
  - a structured **envelope**
    `{ jobs, proposals, contracts, rooms, messages, transactions, timeLogs }`
    matching Upwork's GDPR-style export naming;
  - a raw **CSV string** (Upwork "Reports → Transaction History"
    export — header `Date,Type,Description,Amount,Balance,Freelancer,…`).

  Output: one `msg:upwork:<external_id>` link per message + sibling
  `job:upwork:*` / `contract:upwork:*` / `room:upwork:*` /
  `transaction:upwork:*` links via `buildMessageLink()` and the local
  link helpers.

- `createUpworkLive({ token, fetchImpl, baseUrl, organizationId })`
  wraps the GraphQL endpoint at `https://api.upwork.com/graphql` with
  `Authorization: Bearer <PAT>`:
  - `searchJobs({ query, sort, limit })` runs
    `marketplaceJobPostingsSearch` and yields `job:upwork:*` links.
  - `pullMessages({ stage, perspective, jobId, contractId, roomId })`
    enumerates the relevant rooms and walks `roomsRoomMessages` /
    `roomsListRooms` style queries with Relay cursor pagination.
  - `listContracts({ perspective })` paginates `contracts` for the
    chosen perspective so the SPA / CLI can pick which contract
    rooms to ingest.
  - `post({ text }, { roomId, contractId })` issues the
    `roomsCreateMessage` mutation. Mutation/query names are
    overridable via `operationOverrides` because Upwork's docs portal
    is gated and several field names are **unverified** publicly.

- The adapter is registered in
  [`js/src/sources/index.js`](../../../js/src/sources/index.js) so the
  existing `importInto()` and `pullLiveInto()` paths apply
  automatically.

- The JS server adds three new mutating routes (`/api/upwork/pull`,
  `/api/upwork/search`, `/api/upwork/post-message`) that read the
  OAuth access token from `secret:upwork:access-token` and stamp
  imported links with `stampSourceLink(link, 'upwork')`.

- The CLI gains `upwork-search`, `upwork-message`, and
  `source-pull --source=upwork --stage=… --perspective=…` (the latter
  reuses the existing dispatch).

- The SPA `providerCatalogue` (in
  [`js/src/web/connection-guides.js`](../../../js/src/web/connection-guides.js))
  gets an `upwork` card with archive accept filter `.json,.csv`, two
  password fields (access token and optional refresh token), an
  optional organization id, and a `https://api.upwork.com/graphql`
  POST probe running `query { user { id } }`.

The full per-requirement deliverable map lives in
[`solution-plan.md`](./solution-plan.md); the libraries we _did not_
adopt (`@upwork/node-upwork-oauth2`, `python-upwork-oauth2`,
third-party MCP wrappers) are documented with rationale in
[`components.md`](./components.md).

## 4. Why a dependency-free GraphQL adapter?

The project keeps every source adapter dependency-free so the same
file works in Bun, Node, Deno, and the browser. Upwork's official
`@upwork/node-upwork-oauth2` SDK is a thin wrapper over the same
GraphQL HTTP endpoint and adds a multi-package dependency tree we do
not need; we already have `requestJson()` and `authHeaders()` in
[`js/src/sources/http.js`](../../../js/src/sources/http.js). We do
re-document the SDK in `components.md` so future contributors can
find it.

## 5. Why a 24-hour soft cache?

Upwork's API ToS forbids persistent caching of "Upwork Content" beyond
about 24 hours without explicit consent. The link store is
local-first by design, so live-pulled Upwork links carry an explicit
`cacheTtlMs` field and a `softCache: true` flag; the adapter exposes
`softCacheRetention(store, { ttlMs, now })` which the CLI calls before
each pull. **User-supplied export rows are durable**: the user owns
the data they exported and the adapter does not stamp those links
with a TTL.

The constraint is documented in `external-research.md` and surfaces
to users in the connection guide hint string.

## 6. Verification

Run the new tests directly:

```bash
node --test --test-timeout=30000 js/tests/upwork-source.test.js
```

The suite covers archive import (envelope + array + CSV), live
`searchJobs`, `pullMessages` for both `client` and `freelancer`
perspectives, `post()` mutation, source-registry integration, and the
`softCacheRetention()` helper. Together with
`js/tests/sources.test.js` (which now asserts the registry includes
`upwork`) and
`js/tests/connection-guides-templates.test.js` (which asserts the
catalogue exposes the Upwork probe URL) the expected behaviour is
locked in before any end-to-end run.

The PR description records the reproduction steps and the full local
verification log.
