# Delivery order and winning-write clocks

Issue 56 requires synchronization in every direction. Published `fc7c095c`
has several independent merge divergences. Equal vectors and equal or absent
legacy versions select the local argument. Concurrent merges join clocks onto
the winning payload, so a later merge treats that synthetic clock as a newer
write. Child insertion order, object-key insertion order, decimal tick width and
explicit zero counters also change the result.

A finite example uses three writes to one link: A at `{a: 2}`, B at `{b: 1}`
and C at `{a: 1, b: 1}`. The parent produces B for `(A merge B) merge C` and C
for `A merge (B merge C)`. The independent Playwright MCP reproduction persists
the first merge through actual IndexedDB, reopens it, then observes this same
disagreement. Equal-clock writes A/Z also disagree when their argument order
is reversed. Five selected automated regression cases fail on the exact parent.

The JavaScript merge is now a product of a max register, an observed vector join
and a grow-only child set. The winning assignment keeps its original clock in
`__msSyncStamp` when observations extend beyond it. Its immutable rank compares
the exact sum of that original clock, the canonical clock, numeric decimal tick
versions and a type-tagged canonical payload tie. A strict vector increase
strictly increases the sum; concurrent writes receive one deterministic order.
Joined observations cannot promote an old assignment. Child IDs are deduplicated
and sorted. Clock helpers normalize zeros, preserve prototype-shaped actor IDs
as own properties and refuse invalid counters or exhausted increments.

A new causal assignment must tick the observed vector. When the record advances
beyond the saved stamp context, the new vector becomes its assignment clock.
Stamp clocks and contexts are detached from the mutable record vector. Winning
local payloads retain their types. Existing network normalization still governs
dates, undefined, nonfinite numbers and provider bigint IDs; this change does
not promise arbitrary local JavaScript types survive network exchange unchanged.
Canonical tie encoding is internal and does not introduce a JSON wire format.

Schema 11 reserves `__msSyncStamp` and refuses an existing owner-field collision
before advancing the schema. Historical records are otherwise unchanged; no
historical timestamps are invented. Repeating the migration accepts stamps
generated after schema 11. Production JavaScript peers supply the current schema
and reject incompatible peers using the existing handshake. Library callers
that omit schema negotiation remain responsible for their compatibility policy.
The native core's older merge implementation and incomplete native sync path
are separate unfinished parity work; this unit makes no native-parity claim.

Reproduction and focused validation:

```sh
python3 -B experiments/issue-56/register-before.py
node --test --test-concurrency=1 js/tests/sync-register.test.js js/tests/sync-register-network.test.js js/tests/migrations-sync-stamps.test.js js/tests/sync.test.js js/tests/migrations-registry.test.js js/tests/migrations-core.test.js js/tests/sync-receive-isolation.test.js js/tests/sync-receive-storage.test.js js/tests/sync-hub-relay.test.js js/tests/sync-hub-network.test.js
node --test --test-concurrency=1 js/tests/sync-register-storage.test.js js/tests/migrations-store.test.js js/tests/migrations-surface.test.js js/tests/browser-store.test.js
node js/scripts/build-web.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node js/tests/e2e-lino-sync.mjs
```

The two focused Node groups pass 81 and 28 checks. Cases include six finite
three-write permutation fixtures, duplicate delivery, explicit causal updates,
exact large counter sums, local typed payloads, invalid stamps, schema migration,
durable text/binary reopen and real text/binary TCP plus mixed WebSocket peers.
An initial binary-TCP test configured its listener for text; the preserved first
run reports that fixture failure. Matching the explicit TCP formats fixes the
fixture, while WebSocket format negotiation remains mixed. Existing atomic
receive, relay, secret guards and migration/backup checks also pass.

The rebuilt app passes its existing native WebKit offline rediscovery, owner-edit
race, three-peer mesh, connected reload, fresh bidirectional writes, deletion and
remaining-pair checks with zero page errors. The independent MCP IndexedDB probe
produces A in both groupings and Z in both equal-clock argument orders, retaining
original `{a: 2}` and observed `{a: 2, b: 1}` clocks. Start
`node experiments/issue-56/register-fixture.mjs`, open its isolated URL with MCP
and evaluate `run('before')` and `run('after')` exported by `/probe.mjs` to repeat
it. The fixture and browser are closed afterward. No full suite, runtime/browser
matrix or stress probe runs locally.

The [checksummed evidence](data/sync-register.tar.gz) retains exact parent source,
final sources, finite scripts, raw validation outputs and the rebuilt bundle
digest. Scoped lint, formatting, secrets and the existing minor release changeset
are checked before publication. Hosted checks must be verified for the new SHA.

The archive also preserves subsequent CI confirmation for the prior cold-copy
fix. On `ff43da4f`, all three Windows Deno shards pass; raw job `131986863539`
reports 1,888 passes, zero failures and four ignores at line 5106. Its startup
trace at lines 2224–2241 records roughly 1.7 seconds for copying, 2.3 seconds
through verification/publication and 4.5 seconds through control readiness.
The former fixed-batch copy consumed about 8.5 seconds before worker startup.
The unchanged ten-second deadline is preserved. The old run's final aggregate
is superseded by cancellation after the next push: raw aggregate job
`131993233330`, lines 351–353, reports cancelled test/browser results and exit 1.
The attempted full cancelled-run log download is preserved separately; it is
partial and does not stand in for complete successful-run evidence.

Ordinary writes still lack automatic causal stamping. Initial/disconnected
reconciliation, durable deletion history, multi-tab writer coordination, native
parity and all other unchecked original criteria remain unfinished. This unit
alone does not complete cross-device synchronization. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged until the full requested scope is implemented and verified.
