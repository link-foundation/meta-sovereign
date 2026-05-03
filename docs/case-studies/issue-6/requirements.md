# Requirements — Issue #6

Atomic requirements extracted from the [issue body](./data/issue-6.json).
Each item carries a stable `R-K*` identifier for traceability across
changesets, PR descriptions, and code comments. The same identifiers
also appear in the canonical [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md)
under section **K. Hardening (issue #6)**.

## K1. Soft-delete by default

| ID   | Requirement                                                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-K1 | Messages are **never** physically deleted by default — even when the upstream service reports a delete. Instead the link is marked `deleted: { at, by }`. |
| R-K2 | Deleted-marked links are still queryable so the user can recover them.                                                                                    |
| R-K3 | A `purge` operation physically removes a deleted link, but only after **explicit operator confirmation**.                                                 |
| R-K4 | Bulk purge takes a query (e.g. "delete every msg:vk:\* tombstone older than 30 days") and refuses to run without a `confirm: true` flag.                  |
| R-K5 | Soft-delete must propagate over sync so peers converge on the same tombstones, but `purge` must **not** propagate (it stays a local destructive op).      |
| R-K6 | All provider adapters (VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru) report deletes as soft-deletes by default.     |

## K2. Encryption at rest with master key

| ID    | Requirement                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R-K7  | Everything written to disk is encrypted by default; plaintext exists only in memory.                                                       |
| R-K8  | Encryption uses a single per-vault **master key** (data-encryption key). Per-record keys derive from the master key.                       |
| R-K9  | The master key is unlockable through **multiple methods**: passphrase, PIN, passkey (WebAuthn), authenticator-app TOTP recovery code.      |
| R-K10 | Adding/removing a method does **not** require re-encrypting data. Each method stores its own ciphertext copy of the master key (key wrap). |
| R-K11 | Losing all unlock methods means the user must re-import data from upstream services; the issue calls this out explicitly.                  |
| R-K12 | The vault is loaded into memory only after a successful unlock; locking the vault zeroes the key and stops any in-flight encrypted writes. |

## K3. Encrypted exports / backups

| ID    | Requirement                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| R-K13 | Export-to-file is encrypted by default; plaintext export requires an explicit opt-in.                                           |
| R-K14 | The export envelope embeds a human-readable warning that the user is responsible for securing the file.                         |
| R-K15 | Encrypted exports use the same envelope format as encrypted backups so a single passphrase decrypts both surfaces.              |
| R-K16 | The CLI exposes `meta-sovereign export-encrypted --file=… --passphrase=…` so users can take encrypted backups manually.         |
| R-K17 | The HTTP server exposes `POST /api/export-encrypted` that produces the same envelope, gated on a server-side passphrase config. |

## K4. Documentation deliverable (issue #6)

| ID    | Requirement                                                                          |
| ----- | ------------------------------------------------------------------------------------ |
| R-K18 | Compile data into `./docs/case-studies/issue-6/`.                                    |
| R-K19 | Search online for additional facts; record findings in `external-research.md`.       |
| R-K20 | List every requirement extracted from the issue (this file).                         |
| R-K21 | Propose possible solutions and a solution plan per requirement (`solution-plan.md`). |
| R-K22 | Check existing components/libraries that solve similar problems (`components.md`).   |
| R-K23 | Update `docs/REQUIREMENTS.md` to reflect all of the above.                           |
| R-K24 | Plan and execute everything in a single PR (#7).                                     |
