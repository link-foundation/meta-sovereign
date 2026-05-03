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
| R-K6 | All provider adapters (VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru) report upstream deletes as soft-deletes.       |

## K2. Encryption at rest with master key

| ID    | Requirement                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R-K7  | At-rest encryption uses a single per-vault **master key**; plaintext exists only in memory.                                                 |
| R-K8  | The master key is unlockable through **multiple methods**: passphrase, PIN, passkey (WebAuthn `prf`), authenticator-app TOTP recovery code. |
| R-K9  | Adding/removing a method does **not** require re-encrypting data. Each method stores its own wrapped copy of the master key.                |
| R-K10 | Locking the vault zeroes the master key in memory and stops any in-flight encrypted writes.                                                 |
| R-K11 | Removing the last unlock method is refused so users cannot accidentally orphan their data.                                                  |
| R-K12 | Losing all unlock methods means the user must re-import data from upstream services; there is **no** recovery backdoor.                     |

## K3. Encrypted exports / backups

| ID    | Requirement                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| R-K13 | Export-to-file is encrypted by default; the envelope embeds a human-readable warning that the user is responsible for the file. |
| R-K14 | Encrypted exports round-trip through `decryptExport` and use the same envelope format as encrypted backups.                     |
| R-K15 | The CLI exposes `meta-sovereign export-encrypted --file=… --passphrase=…`.                                                      |
| R-K16 | The HTTP server exposes `POST /api/export-encrypted` returning the same envelope.                                               |
| R-K17 | A documented `purge-tombstones` HTTP endpoint and CLI surface so operators can clean up after an audit.                         |

## K4. Documentation deliverable (issue #6)

| ID    | Requirement                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| R-K18 | Compile data into `./docs/case-studies/issue-6/` — deep analysis, online research, requirements, plans, components survey. |
| R-K19 | Update `docs/REQUIREMENTS.md` to reflect all of the above.                                                                 |
| R-K20 | Plan and execute everything in a single PR (#7).                                                                           |
