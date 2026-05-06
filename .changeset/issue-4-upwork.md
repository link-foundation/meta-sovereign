---
'meta-sovereign': minor
---

R-S1..R-S22: Add Upwork as the twelfth first-class `MessageSource`.
The new `js/src/sources/upwork.js` adapter normalises jobs,
proposals, contracts, rooms, room messages, time logs, and
transactions into `msg:upwork:<external_id>` links plus dedicated
`job:upwork:`, `proposal:upwork:`, `contract:upwork:`,
`room:upwork:`, and `transaction:upwork:` link kinds. It ships
both an archive importer (raw GraphQL/array dumps, the
`{jobs, proposals, contracts, rooms, messages, transactions,
timeLogs}` envelope, and the Reports → Transaction History CSV
sniffed against the Upwork header) and a live GraphQL client at
`https://api.upwork.com/graphql` with `Bearer` OAuth 2.0 auth,
Relay-style `pageInfo.endCursor` pagination, an injectable
`fetchImpl` for tests, and an `operationOverrides` escape hatch for
unverified field names. The live surface adds `searchJobs`
(`marketplaceJobPostingsSearch`), `pullMessages` covering both the
**proposal** stage (before approval) and the **contract** stage
(after approval) from either the **client** or **freelancer**
perspective, and `post` for the `roomsCreateMessage` mutation. To
honour the Upwork ToS, every live-pulled link is stamped with
`softCache: true` and `cacheTtlMs: 86_400_000` (24 h);
`softCacheRetention()` purges expired live links while leaving
archive imports durable. CLI gains `upwork-search` and
`upwork-message`; `source-pull --source=upwork` forwards `stage`,
`perspective`, `jobId`, `contractId`, `proposalId`, `roomId`, and
`organizationId`. The JS server adds same-origin proxy routes
`POST /api/upwork/pull|search|post-message` so the SPA stays
useful when CORS blocks browser-direct calls. The connection guide
catalogue exposes an Upwork provider entry that probes the GraphQL
endpoint and persists the access/refresh tokens in
`secret:upwork:access-token` and `secret:upwork:refresh-token`.
Tests live in `js/tests/upwork-source.test.js`. The full atomic
requirement list and solution plan live under
`docs/case-studies/issue-4/`.
