# Solution Plan for Issue #12

The plan turns each requirement in [`requirements.md`](./requirements.md)
into a concrete deliverable. The order matches the order PR #24 lands
them.

## Plan

1. **Capture the issue.** Save `data/issue.json` and
   `data/comments.json` straight from the GitHub REST API so future
   readers do not have to re-fetch them. Author the case-study
   artefacts (`README.md`, `requirements.md`, `solution-plan.md`,
   `components.md`, `external-research.md`) — covers `R-T17`,
   `R-T18`, `R-T19`.

2. **Add the `peopleperhour` source adapter.** Create
   `js/src/sources/peopleperhour.js` with:
   - `parseArchive(input)` that accepts an array of REST nodes,
     the GDPR-style envelope
     `{ projects, proposals, workstreams, rooms, messages, invoices, hourstreams }`,
     and CSV strings (header sniffed) — covers `R-T1`, `R-T2`,
     `R-T9`, `R-T10`, `R-T11`.
   - `createPeoplePerHourLive({ token, fetchImpl, baseUrl, endpointOverrides })`
     exposing:
     - `searchProjects({ query, sort, limit })` running
       `GET /projects/search` — covers `R-T4`.
     - `listWorkstreams({ perspective })` running
       `GET /workstreams` for the chosen perspective — supports
       `R-T6`, `R-T7`.
     - `pullMessages({ stage, perspective, projectId, workstreamId, roomId })`
       walking proposal / workstream rooms via
       `GET /proposals/{id}/messages` and
       `GET /workstreams/{id}/messages` — covers `R-T3`, `R-T5`,
       `R-T6`, `R-T7`.
     - `post({ text }, { roomId, workstreamId })` issuing
       `POST /workstreams/{id}/messages` (or
       `POST /proposals/{id}/messages`) — covers `R-T8`.
   - `softCacheRetention(store, { ttlMs, now })` purges
     `softCache: true` PeoplePerHour links whose `cacheTtlMs` has
     expired — covers `R-T12`.

3. **Register the source.** Add `peopleperhour` to
   `js/src/sources/index.js` so `listSources()`, `importInto()`, and
   `pullLiveInto()` work for it — covers `R-T1`.

4. **Add server routes.** Extend `js/src/server/routes-mutating.js`
   with `POST /api/peopleperhour/pull`,
   `POST /api/peopleperhour/search`, and
   `POST /api/peopleperhour/post-message`, all of which read
   `secret:peopleperhour:access-token` from the store, call into the
   live adapter, and stamp imported links — covers `R-T14`, `R-T16`.

5. **Add CLI subcommands.** Extend `js/src/cli/index.js` with:
   - `source-pull --source=peopleperhour [--stage=<proposal|workstream|all>]
[--perspective=<buyer|freelancer|both>]
[--token=<pat>]` (already routed through `pullLiveInto` once
     registered).
   - `peopleperhour-search --query=<q> --token=<pat> [--limit=<n>]
[--sort=<spec>]`.
   - `peopleperhour-message --room-id=<r> --text=<t>
[--workstream-id=<w>] --token=<pat>`.
   - The existing `import --source=peopleperhour --file=<path>` path
     picks up CSV / JSON archives via `parseArchive` automatically.
     Covers `R-T13`.

6. **Add the connection guide.** Add a `peopleperhour` entry to
   `providerCatalogue` in
   `js/src/web/connection-guides.js`:
   - Archive accepts `.json,.csv`.
   - Two password fields: `accessToken`
     (`secret:peopleperhour:access-token`) and `refreshToken`
     (`secret:peopleperhour:refresh-token`).
   - Probe URL `https://www.peopleperhour.com/api/v1/me` with `GET`
     and `Authorization: Bearer {accessToken}`.
   - Error hints for 401/403 (token expired / scope missing).
   - Hint string explicitly notes the 24-hour caching restriction
     so users see it before they import live data. Covers `R-T15`,
     `R-T16`.

7. **Add tests first.** Author
   `js/tests/peopleperhour-source.test.js` with cases for:
   - Archive import (envelope including `messages`, `rooms`,
     `workstreams`, `projects`, `proposals`, `invoices`).
   - Archive import (array of mixed nodes).
   - Archive import (CSV earnings string).
   - `searchProjects` with a stub `fetchImpl` returning a canned
     `projects/search` payload.
   - `pullMessages({ perspective: 'freelancer' })` with stubbed
     workstreams/rooms/messages — confirms multi-room walking.
   - `pullMessages({ perspective: 'buyer' })` confirms the same
     adapter handles the buyer perspective.
   - `post()` issuing the right REST operation.
   - Source registry sanity (`listSources()` includes
     `peopleperhour`, `importInto(store, 'peopleperhour', envelope)`
     writes the expected links).
   - `softCacheRetention()` purges expired live links and leaves
     archive links alone.
     Covers `R-T20`.

8. **Update top-level docs.**
   - Append a new `R-T*` table to `docs/REQUIREMENTS.md`.
   - Mention PeoplePerHour in the README "Unified inbox" line and
     the service-connector status line.
   - Translate the README change into the four locale variants
     (`README.hi.md`, `README.ru.md`, `README.zh.md`) so the
     documentation language test stays green.
     Covers `R-T21`.

9. **Add a changeset.** Drop a `.changeset/issue-12-peopleperhour.md`
   file so the release workflow can pick it up; the summary cites
   `R-T*` per the traceability rule.

10. **Bump Rust crates** and add `peopleperhour` to the Rust
    `SOURCES` const + the wire-protocol test, keeping JS/Rust in
    lock-step (recent precedent: PR #23 for Upwork did the same).

11. **Finalize the PR.** Run the local fast checks
    (`bun run lint`, `bun run format:check`,
    `node --test js/tests/peopleperhour-source.test.js js/tests/sources.test.js`,
    `cargo test --workspace`),
    update the PR body with reproduction steps and link the case
    study, and flip from Draft to ready. Covers `R-T22`.

## Result

The plan above is what PR #24 ships. The adapter is intentionally
small and dependency-free so it works in the SPA, the JS server, and
the CLI without runtime-specific shims. Live calls go straight to
PeoplePerHour's REST endpoint with `Bearer` auth and cursor-style
pagination; archive imports cover both the GDPR JSON envelope and
the Earnings CSV format the platform serves; the soft-cache
retention helper keeps the implementation aligned with PeoplePerHour's
API ToS without forcing users to lose their own exported data.

Authentication piggy-backs on the existing `secret:*` link encryption
(AES-256-GCM via `wrapSecretStore`), and the case-study artefacts
document the analysis the issue requested.
