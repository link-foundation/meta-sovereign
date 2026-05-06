# Case Study: Issue #12 — Add PeoplePerHour support

**Issue:** [#12 — Add people per hour support](https://github.com/link-foundation/meta-sovereign/issues/12)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-12-1fbe3b7d05b4`
**Pull Request:** [#24](https://github.com/link-foundation/meta-sovereign/pull/24)

This case study collects every directive from issue #12, decomposes it
into atomic requirements (`R-T*`), records the prior art and tooling
surveyed, and lays out the solution plan that PR #24 implements
against the existing local-first / privacy-first design constraints
already established in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md)
and the closely-related Upwork case study under
[`docs/case-studies/issue-4/`](../issue-4/README.md).

The artefacts in this folder are:

| File                   | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                                    |
| `requirements.md`      | Atomic requirement list (`R-T*`) extracted from the issue.                                              |
| `solution-plan.md`     | Phased plan mapping each requirement to a concrete deliverable in PR #24.                               |
| `components.md`        | Catalogue of upstream tooling and standards consulted, plus the components reused from this repository. |
| `external-research.md` | Summary of external research about PeoplePerHour, its public API surface, exports, and ToS constraints. |
| `data/`                | Raw artefacts (`issue.json`, `comments.json`) used to build this study.                                 |

---

## 1. Vision (paraphrased from the issue)

The reporter asks the project to support **task / job communication on
PeoplePerHour** — both **before** the worker is approved (project
postings, proposal threads) and **after** they are hired (workstreams,
hourstream timesheets) — and to do it **from both perspectives**: the
**task giver (buyer)** posting work and the **task taker (freelancer)**
delivering it. All of the resulting data needs to live in the
project's links data store, and the user must also be able to **import
their account-level PeoplePerHour data exports** so historical threads
are searchable offline.

> **Note on the issue body.** The issue title says "Add people per hour
> support". The body refers in passing to "exports from upwork" — that
> is a copy/paste artefact from the immediately preceding Upwork issue
> (#4) and not a directive to ship Upwork twice. We treated the title
> as authoritative, mirrored the data shapes that PeoplePerHour
> publishes (projects, proposals, workstreams, messages, invoices),
> and where PeoplePerHour exposes a richer concept than Upwork (e.g.
> the "Hourly" buyer-side commit log) we modelled it explicitly. The
> Upwork adapter remains the architectural neighbour we measure
> ourselves against.

The case study itself is a deliverable: the issue insists on a
`docs/case-studies/issue-12/` folder with deep analysis, online
research, an explicit requirement list, a per-requirement solution
plan, and a survey of existing components or libraries. Everything
must land in a single PR that iterates until each requirement is
fully addressed.

The directive sits across three of the project's existing pillars:

- **Unified inbox.** PeoplePerHour becomes the thirteenth
  `MessageSource` alongside email, Telegram, VK, X, WhatsApp,
  Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru, GitHub,
  and Upwork. Workstream messages and proposal threads are
  conversational and map onto `msg:peopleperhour:<external_id>` via
  [`buildMessageLink()`](../../../js/src/sources/link.js).
- **Job-board parity.** PeoplePerHour joins habr-career, hh.ru,
  superjob.ru, and Upwork in the "job-board adapter" cluster. Like
  those adapters, it surfaces both the postings and the chat about
  them.
- **Repository-as-data.** Where the GitHub adapter writes file links
  under `repo:<owner>/<name>:*`, the PeoplePerHour adapter writes
  `project:peopleperhour:<id>`, `proposal:peopleperhour:<id>`,
  `workstream:peopleperhour:<id>`, `room:peopleperhour:<id>`,
  `invoice:peopleperhour:<id>`, and `hourstream:peopleperhour:<workstream>:<weekStart>`
  so the CRM can group threads by project, workstream, or week without
  re-walking message bodies.

## 2. Decomposed requirements

Twenty-two atomic requirements (`R-T1..R-T22`) come out of the issue.
The full list — with the implementation status for each — lives in
[`requirements.md`](./requirements.md). At a glance:

- **R-T1..R-T2** — the source itself: register PeoplePerHour in the
  `MessageSource` registry and accept its archive shapes.
- **R-T3..R-T8** — live API pulls (project search, proposal-room
  messages, workstream messages, both perspectives, post a reply).
- **R-T9..R-T11** — account-level data import, plus dedicated link
  kinds for projects and workstreams so reports can join across them.
- **R-T12** — explicit alignment with PeoplePerHour's API ToS: live
  data is treated as a 24-hour soft cache; user-supplied export rows
  are durable.
- **R-T13..R-T16** — CLI / server / SPA / secret-store surfaces.
- **R-T17..R-T22** — the case-study artefacts, library survey,
  reproducing tests, top-level docs, and the single-PR delivery rule.

## 3. Solution overview

The implementation lives almost entirely in
[`js/src/sources/peopleperhour.js`](../../../js/src/sources/peopleperhour.js):

- `peoplePerHourSource.parseArchive(input)` accepts:
  - an **array** of API nodes / payloads — auto-classified as
    project / proposal / workstream / room / message / invoice /
    hourstream;
  - a structured **envelope**
    `{ projects, proposals, workstreams, rooms, messages, invoices, hourstreams }`
    matching PeoplePerHour's GDPR-style export naming;
  - a raw **CSV string** (PeoplePerHour Reports → Earnings export —
    header `Date,Type,Description,Net,Gross,Buyer,Freelancer,Reference`).

  Output: one `msg:peopleperhour:<external_id>` link per message +
  sibling `project:peopleperhour:*` /
  `workstream:peopleperhour:*` / `room:peopleperhour:*` /
  `invoice:peopleperhour:*` /
  `hourstream:peopleperhour:<workstream>:<weekStart>` links via
  `buildMessageLink()` and the local link helpers.

- `createPeoplePerHourLive({ token, fetchImpl, baseUrl })` wraps
  the REST API at `https://www.peopleperhour.com/api/v1` with
  `Authorization: Bearer <PAT>`:
  - `searchProjects({ query, sort, limit })` runs `GET /projects/search`
    and yields `project:peopleperhour:*` links.
  - `pullMessages({ stage, perspective, projectId, workstreamId, roomId })`
    enumerates the relevant rooms and walks
    `GET /workstreams/{id}/messages` /
    `GET /proposals/{id}/messages` with cursor pagination.
  - `listWorkstreams({ perspective })` paginates
    `GET /workstreams` for the chosen perspective so the SPA / CLI
    can pick which workstreams to ingest.
  - `post({ text }, { roomId, workstreamId })` issues
    `POST /workstreams/{id}/messages` (or
    `POST /proposals/{id}/messages`). Endpoint paths are overridable
    via `endpointOverrides` because PeoplePerHour's developer portal
    is gated and several paths are **unverified** publicly.

- The adapter is registered in
  [`js/src/sources/index.js`](../../../js/src/sources/index.js) so the
  existing `importInto()` and `pullLiveInto()` paths apply
  automatically.

- The JS server adds three new mutating routes (`/api/peopleperhour/pull`,
  `/api/peopleperhour/search`, `/api/peopleperhour/post-message`) that
  read the OAuth access token from `secret:peopleperhour:access-token`
  and stamp imported links with `stampSourceLink(link, 'peopleperhour')`.

- The CLI gains `peopleperhour-search`, `peopleperhour-message`, and
  `source-pull --source=peopleperhour --stage=… --perspective=…` (the
  latter reuses the existing dispatch).

- The SPA `providerCatalogue` (in
  [`js/src/web/connection-guides.js`](../../../js/src/web/connection-guides.js))
  gets a `peopleperhour` card with archive accept filter `.json,.csv`,
  two password fields (access token and optional refresh token), and a
  `https://www.peopleperhour.com/api/v1/me` GET probe.

The full per-requirement deliverable map lives in
[`solution-plan.md`](./solution-plan.md); the libraries we _did not_
adopt (third-party PPH wrappers) are documented with rationale in
[`components.md`](./components.md).

## 4. Why a dependency-free REST adapter?

The project keeps every source adapter dependency-free so the same
file works in Bun, Node, Deno, and the browser. PeoplePerHour does
not publish an official Node SDK — third-party scrapers exist but
are unmaintained and would add a multi-package dependency tree we do
not need; we already have `requestJson()` and `authHeaders()` in
[`js/src/sources/http.js`](../../../js/src/sources/http.js). The
third-party libraries surveyed are listed in `components.md` so
future contributors can find them.

## 5. Why a 24-hour soft cache?

PeoplePerHour's API ToS forbids persistent caching of platform
content beyond about 24 hours without explicit consent — this matches
the constraint Upwork imposes and the same `softCacheRetention()`
pattern adopted there. The link store is local-first by design, so
live-pulled PeoplePerHour links carry an explicit `cacheTtlMs` field
and a `softCache: true` flag; the adapter exposes
`softCacheRetention(store, { ttlMs, now })` which the CLI calls
before each pull. **User-supplied export rows are durable**: the user
owns the data they exported and the adapter does not stamp those
links with a TTL.

The constraint is documented in `external-research.md` and surfaces
to users in the connection guide hint string.

## 6. Verification

Run the new tests directly:

```bash
node --test --test-timeout=30000 js/tests/peopleperhour-source.test.js
```

The suite covers archive import (envelope + array + CSV), live
`searchProjects`, `pullMessages` for both `buyer` and `freelancer`
perspectives, `post()` mutation, source-registry integration, and the
`softCacheRetention()` helper. Together with
`js/tests/sources.test.js` (which now asserts the registry includes
`peopleperhour`) and the Rust wire-protocol test (which asserts the
`/sources` endpoint exposes `peopleperhour`) the expected behaviour
is locked in before any end-to-end run.

The PR description records the reproduction steps and the full local
verification log.
