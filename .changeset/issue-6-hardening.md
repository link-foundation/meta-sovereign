---
'meta-sovereign': minor
---

Hardening: soft-delete by default, master-key vault, encrypted exports (issue #6).

- **R-K1..R-K6 — Soft-delete by default.** `DELETE /links/:id` and the
  `delete()` method on the storage facade now mark the link with
  `deleted: { at, by }` instead of physically removing it. Tombstones are
  hidden from `GET /links` and `GET /links/:id` by default; pass
  `?include=tombstones` (or `?include=all`) to see them. Hard-delete is
  still available behind `?purge=1&confirm=1`. Provider adapters never
  call `delete` on upstream events — soft-delete is the only path.
- **R-K7..R-K12 — Master-key vault.** New `src/storage/vault.js` holds
  one random 256-bit master key wrapped by one or more unlock methods
  (passphrase, PIN, passkey-`prf` blob, or TOTP recovery code). Adding
  or removing a method only re-wraps the master key — no data is
  re-encrypted (R-K9/R-K10). Removing the last method is refused
  (R-K11). All wrapping uses scrypt + AES-256-GCM, same envelope shape
  as `encryptBackup`.
- **R-K13..R-K17 — Encrypted exports & purge.** New
  `src/storage/export-encrypted.js`, plus
  `POST /api/export-encrypted`, `POST /api/links/purge-tombstones`, and
  CLI subcommands `export-encrypted`, `purge-tombstones`,
  `vault-init`, `vault-add`, `vault-remove`, `vault-list`. Bulk purge
  refuses to run without `confirm: true` (R-K4) and only matches
  tombstones (R-K5).
- **R-K18..R-K20 — Docs.** New case study under
  `docs/case-studies/issue-6/` (deep analysis, online research,
  requirements, plan, components survey) and a new section **K.
  Hardening (issue #6)** in `docs/REQUIREMENTS.md` carrying R-K1..R-K20
  with implementation pointers.
