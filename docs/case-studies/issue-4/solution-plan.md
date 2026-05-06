# Solution Plan for Issue #4

The plan turns each requirement in [`requirements.md`](./requirements.md)
into a concrete deliverable. The order matches the order PR #23 lands
them.

## Plan

1. **Capture the issue.** Save `data/issue.json` and
   `data/comments.json` straight from the GitHub REST API so future
   readers do not have to re-fetch them. Author the case-study
   artefacts (`README.md`, `requirements.md`, `solution-plan.md`,
   `components.md`, `external-research.md`) — covers `R-S17`,
   `R-S18`, `R-S19`.

2. **Add the `upwork` source adapter.** Create
   `js/src/sources/upwork.js` with:
   - `parseArchive(input)` that accepts an array of GraphQL nodes,
     the GDPR-style envelope
     `{ jobs, proposals, contracts, rooms, messages, transactions, timeLogs }`,
     and CSV strings (header sniffed) — covers `R-S1`, `R-S2`,
     `R-S9`, `R-S10`, `R-S11`.
   - `createUpworkLive({ token, fetchImpl, baseUrl, organizationId, operationOverrides })`
     exposing:
     - `searchJobs({ query, sort, limit })` running
       `marketplaceJobPostingsSearch` — covers `R-S4`.
     - `listContracts({ perspective })` running the contracts
       connection — supports `R-S6`, `R-S7`.
     - `pullMessages({ stage, perspective, jobId, contractId })`
       walking proposal / contract rooms via `roomsListRooms` and
       `roomsRoomMessages` — covers `R-S3`, `R-S5`, `R-S6`, `R-S7`.
     - `post({ text }, { roomId, contractId })` issuing
       `roomsCreateMessage` — covers `R-S8`.
   - `softCacheRetention(store, { ttlMs, now })` purges
     `softCache: true` Upwork links whose `cacheTtlMs` has expired —
     covers `R-S12`.

3. **Register the source.** Add `upwork` to
   `js/src/sources/index.js` so `listSources()`, `importInto()`, and
   `pullLiveInto()` work for it — covers `R-S1`.

4. **Add server routes.** Extend `js/src/server/routes-mutating.js`
   with `POST /api/upwork/pull`, `POST /api/upwork/search`, and
   `POST /api/upwork/post-message`, all of which read
   `secret:upwork:access-token` from the store, call into the live
   adapter, and stamp imported links — covers `R-S14`, `R-S16`.

5. **Add CLI subcommands.** Extend `js/src/cli/index.js` with:
   - `source-pull --source=upwork [--stage=<proposal|contract|all>]
[--perspective=<client|freelancer|both>]
[--organization-id=<id>] [--token=<pat>]` (already routed
     through `pullLiveInto` once registered).
   - `upwork-search --query=<q> --token=<pat> [--limit=<n>]
[--sort=<spec>]`.
   - `upwork-message --room-id=<r> --text=<t> [--contract-id=<c>]
--token=<pat>`.
   - The existing `import --source=upwork --file=<path>` path picks
     up CSV / JSON archives via `parseArchive` automatically. Covers
     `R-S13`.

6. **Add the connection guide.** Add an `upwork` entry to
   `providerCatalogue` in
   `js/src/web/connection-guides.js`:
   - Archive accepts `.json,.csv`.
   - Two password fields: `accessToken`
     (`secret:upwork:access-token`) and `refreshToken`
     (`secret:upwork:refresh-token`); optional `organizationId`.
   - Probe URL `https://api.upwork.com/graphql` with `POST`,
     `Authorization: Bearer {accessToken}`, and the body
     `{"query": "query { user { id } }"}`.
   - Error hints for 401/403 (token expired / scope missing).
   - Hint string explicitly notes the 24-hour caching restriction
     so users see it before they import live data. Covers `R-S15`,
     `R-S16`.

7. **Add tests first.** Author
   `js/tests/upwork-source.test.js` with cases for:
   - Archive import (envelope including `messages`, `rooms`,
     `contracts`, `jobs`, `transactions`).
   - Archive import (array of mixed nodes).
   - Archive import (CSV transaction string).
   - `searchJobs` with a stub `fetchImpl` returning a canned
     `marketplaceJobPostingsSearch` payload.
   - `pullMessages({ perspective: 'freelancer' })` with stubbed
     contracts/rooms/messages — confirms multi-room walking.
   - `pullMessages({ perspective: 'client' })` confirms the same
     adapter handles the client perspective.
   - `post()` issuing the right GraphQL operation.
   - Source registry sanity (`listSources()` includes `upwork`,
     `importInto(store, 'upwork', envelope)` writes the expected
     links).
   - `softCacheRetention()` purges expired live links and leaves
     archive links alone.
     Covers `R-S20`.

8. **Update top-level docs.**
   - Append a new `R-S*` table to `docs/REQUIREMENTS.md`.
   - Mention Upwork in the README "Unified inbox" line and the
     service-connector status line.
   - Translate the README change into the four locale variants
     (`README.hi.md`, `README.ru.md`, `README.zh.md`) so the
     documentation language test stays green.
     Covers `R-S21`.

9. **Add a changeset.** Drop a `.changeset/issue-4-upwork.md` file so
   the release workflow can pick it up; the summary cites `R-S*` per
   the traceability rule.

10. **Finalize the PR.** Run the local fast checks
    (`bun run lint`, `bun run format:check`,
    `node --test js/tests/upwork-source.test.js js/tests/sources.test.js`),
    update the PR body with reproduction steps and link the case
    study, and flip from Draft to ready. Covers `R-S22`.

## Result

The plan above is what PR #23 ships. The adapter is intentionally
small and dependency-free so it works in the SPA, the JS server, and
the CLI without runtime-specific shims. Live calls go straight to
Upwork's GraphQL endpoint with `Bearer` auth and Relay-style cursor
pagination; archive imports cover both the GDPR JSON envelope and
the Reports CSV format the platform actually serves; the soft-cache
retention helper keeps the implementation aligned with Upwork's API
ToS without forcing users to lose their own exported data.

Authentication piggy-backs on the existing `secret:*` link encryption
(AES-256-GCM via `wrapSecretStore`), and the case-study artefacts
document the analysis the issue requested.
