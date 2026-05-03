# Solution plan — Issue #6

This plan maps each `R-K*` requirement to the concrete change in PR
#7. The order is the order of commits in the branch.

## Phase 1 — Soft-delete by default (R-K1 … R-K6)

1. **Tombstone convention.** A "deleted" link is the same link as
   before, with an additional field
   `deleted: { at: ISOString, by: handlerId, reason?: string }`. The
   existing payload (tokens, body, sender, etc.) stays intact so the
   user can recover the message.
2. **`store.softDelete(id, { reason, by })`**. Reads the link,
   merges `deleted: { at, by, reason }` into it, and re-puts it. The
   helper lives in `src/storage/soft-delete.js` and is exported from
   `src/storage/index.js` so adapters and handlers can reuse it.
3. **`store.purge(id, { confirm })`**. Hard-deletes via the underlying
   store but **only** when `confirm === true`. Without confirmation it
   throws so a misuse cannot silently drop data.
4. **`bulkPurge(store, predicate, { confirm })`**. Same contract for
   bulk operations. Used by an admin-only CLI subcommand.
5. **Sync propagation.** Soft-delete is a `put` of the tombstone link,
   so the existing peer mesh propagates it for free. The destructive
   `purge` is intentionally local — `peer.receive` already only
   handles `put`/`delete` events; we never emit a delete event from
   `purge` so a remote peer cannot weaponise the API to wipe peers.
6. **Adapter integration.** Source adapters (Telegram bot updates,
   VK exports, etc.) that observe an upstream delete now call
   `softDelete` instead of `delete`. The source bus already stamps
   them with `handled: { at, by }` so the round-trip is idempotent.
7. **HTTP surface.** `DELETE /links/:id` becomes a soft-delete by
   default (matches the issue's "delete should not actually delete"
   wording); a new `DELETE /links/:id?purge=1&confirm=1` performs the
   destructive variant. The existing test for hard-delete still
   passes against `purge=1&confirm=1`; we add a new test for the
   default soft-delete path.

## Phase 2 — Master-key vault (R-K7 … R-K12)

1. **`src/storage/vault.js`** — pure-JS module, Node `crypto` only.
   Exports `createVault({ file })` returning
   `{ initialize, addUnlock, removeUnlock, listUnlocks, unlock, lock,
isUnlocked, encrypt, decrypt }`.
2. **On-disk layout.** A JSON file with a `version`, `cipher`,
   `wraps[]`, where each entry is
   `{ id, kind: 'passphrase' | 'pin' | 'passkey' | 'totp', kdf,
salt, iv, tag, ct }`. The data-encryption key (DEK) is the
   plaintext of every wrap entry. Adding a method computes the wrap
   key from that method and writes a new entry. Removing splices the
   entry out.
3. **In-memory only.** `unlock(method, secret)` returns the DEK and
   stashes it in a closure-local variable; `lock()` zero-fills the
   buffer. `encrypt`/`decrypt` throw if the vault is locked.
4. **Compatibility with `wrapSecretStore`.** When the vault is
   present, `wrapSecretStore` derives its passphrase from
   `vault.encrypt('passphrase')`; this lets the existing
   `secret:*` link encryption keep working without a code change at
   the call sites. PR #2 deployments that pass a raw passphrase still
   work — the vault is **opt-in**.
5. **CLI plumbing.** New subcommands:
   - `vault init --file=… --method=passphrase` (interactive prompt).
   - `vault add-unlock --method=passkey|pin|totp --label=…`.
   - `vault remove-unlock --id=…`.
   - `vault list-unlocks`.
6. **HTTP surface.** Vault management is **out of scope for HTTP** for
   this PR — the vault file is local, and the design assumes the
   operator manages it via the CLI or the SPA's WebAuthn flow.

## Phase 3 — Encrypted exports (R-K13 … R-K17)

1. **`exportEncrypted(store, { passphrase, warning })`** — same JSON
   envelope as `encryptBackup`, with a top-level `warning` field that
   defaults to:

   > **Warning:** this file contains your meta-sovereign data
   > encrypted with the supplied passphrase. If you lose the
   > passphrase you cannot recover the data. You are responsible for
   > storing this file securely.

2. **CLI** — `meta-sovereign export-encrypted --file=… --passphrase=…
--store=…`. If `--passphrase` is omitted the CLI prints the warning
   and refuses to run, satisfying R-K13.
3. **HTTP** — `POST /api/export-encrypted` body
   `{ passphrase, warning? }` returns the JSON envelope. The route
   reuses `exportEncrypted`. The route is gated on the `secretPassphrase`
   server config so a public deployment cannot trivially export.

## Phase 4 — Documentation (R-K18 … R-K24)

1. `docs/case-studies/issue-6/` — created with this plan, the
   requirements list, the components catalogue, and the external
   research notes.
2. `docs/REQUIREMENTS.md` — new section **K. Hardening (issue #6)**
   with one row per `R-K*` requirement and its current state.
3. `README.md` — short paragraph mentioning soft-delete + vault under
   "Status" so readers can find the new modules.

## Test plan

| Area             | Test                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| soft-delete      | `tests/soft-delete.test.js` — round-trip tombstone, query still sees link, `purge({ confirm: false })` throws, `confirm: true` removes. |
| sync propagation | Two memory stores via `loopback`. softDelete on A appears as `deleted` link on B; purge on A does not propagate.                        |
| vault            | `tests/vault.test.js` — init+passphrase, add second unlock (recovery code), remove first, lock/unlock idempotency, wrong secret.        |
| encrypted export | `tests/encrypted-export.test.js` — round-trip via `exportEncrypted`/`decryptBackup`, missing-passphrase rejection, warning emitted.     |
| HTTP surface     | `tests/server.test.js` extension — `DELETE /links/:id` soft-deletes by default; `?purge=1&confirm=1` hard-deletes.                      |
| CLI surface      | `tests/cli.test.js` extension — `vault init`, `vault add-unlock`, `export-encrypted`.                                                   |

All tests run inside the existing `npm test` matrix (Node + Bun + Deno
× Ubuntu/macOS/Windows) — no new CI plumbing needed.
