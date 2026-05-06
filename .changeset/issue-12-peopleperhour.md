---
'meta-sovereign': minor
---

R-T1..R-T22: Add PeoplePerHour as the thirteenth first-class
`MessageSource`. The new `js/src/sources/peopleperhour.js` adapter
normalises projects, proposals, workstreams, rooms, room messages,
hourstreams, and invoices into `msg:peopleperhour:<external_id>`
links plus dedicated `project:peopleperhour:`,
`proposal:peopleperhour:`, `workstream:peopleperhour:`,
`room:peopleperhour:`, `invoice:peopleperhour:`, and
`hourstream:peopleperhour:` link kinds. It ships both an archive
importer (raw REST/array dumps, the
`{projects, proposals, workstreams, rooms, messages, invoices,
hourstreams}` envelope, and the Earnings CSV sniffed against the
PeoplePerHour header) and a live REST client at
`https://www.peopleperhour.com/api/v1` with `Bearer` OAuth 2.0
auth, REST cursor pagination via the `nextCursor` field, an
injectable `fetchImpl` for tests, and an `endpointOverrides`
escape hatch for unverified paths. The live surface adds
`searchProjects` (`GET /projects/search`), `pullMessages` covering
both the **proposal** stage (before approval) and the
**workstream** stage (after approval) from either the **buyer**
or **freelancer** perspective, and `post` for
`POST /workstreams/{id}/messages` and
`POST /proposals/{id}/messages`. To honour the PeoplePerHour API
ToS, every live-pulled link is stamped with `softCache: true` and
`cacheTtlMs: 86_400_000` (24 h); `softCacheRetention()` purges
expired live links while leaving archive imports durable. CLI
gains `peopleperhour-search` and `peopleperhour-message`;
`source-pull --source=peopleperhour` forwards `stage`,
`perspective`, `projectId`, `workstreamId`, `proposalId`, and
`roomId`. The JS server adds same-origin proxy routes
`POST /api/peopleperhour/pull|search|post-message` so the SPA
stays useful when CORS blocks browser-direct calls. The connection
guide catalogue exposes a PeoplePerHour provider entry that probes
`https://www.peopleperhour.com/api/v1/me` and persists the
access/refresh tokens in `secret:peopleperhour:access-token` and
`secret:peopleperhour:refresh-token`. Tests live in
`js/tests/peopleperhour-source.test.js`. The Rust server's
`SOURCES` registry gains `peopleperhour` and crate versions sync
with the JS package. The full atomic requirement list and
solution plan live under `docs/case-studies/issue-12/`.
