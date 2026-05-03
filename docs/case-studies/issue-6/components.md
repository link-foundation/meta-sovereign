# Components and prior art

This catalogue records the existing in-tree primitives we build on,
plus the upstream standards/libraries the design follows. We avoid
adding any new runtime dependency in PR #7; everything below is either
already in the workspace or part of Node's standard library.

## In-tree primitives we already have

| Module                        | What it gives us                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/storage/secret-store.js` | `wrapSecretStore({ inner, passphrase })` — AES-256-GCM at-rest encryption for any link whose id starts with `secret:`. Re-used as the building block for K7.       |
| `src/storage/backup.js`       | `encryptBackup` / `decryptBackup` AES-256-GCM envelope, `createBackupScheduler`, `pruneBackups`, `restoreBackup`. Reused for encrypted exports (K13–K17).          |
| `src/sync/peer.js`            | Peer that already filters out `secret:*` events on send/receive. We extend the model to **propagate soft-delete tombstones** without leaking secrets.              |
| `src/storage/dual-store.js`   | Write-through to Doublets binary + Links Notation text. Soft-delete just upserts a tombstone link, so both backends stay in step automatically.                    |
| `src/storage/universal.js`    | The minimal Universal Links Access surface. We extend it with `softDelete(id)` and `purge(id)` while keeping the existing `delete(id)` in place for compatibility. |
| `src/handlers/index.js`       | Handler bus. We add a built-in handler that converts upstream "deleted" events into tombstones for K6.                                                             |

## Upstream standards we follow

| Topic                        | Reference                                                         | How we use it                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AES-256-GCM at rest          | NIST SP 800-38D, RFC 5288.                                        | Master-key encryption envelope; each unlock method stores its own AES-256-GCM ciphertext copy of the data-encryption key.                                                |
| Argon2id password KDF        | RFC 9106. <https://datatracker.ietf.org/doc/html/rfc9106>         | Recommended KDF for new passphrases (Node ≥ 22 ships it). We keep the existing scrypt fallback for compatibility with PR #2 backups, and prefer Argon2id when available. |
| RFC 6238 — TOTP              | <https://datatracker.ietf.org/doc/html/rfc6238>                   | Authenticator-app unlock. The TOTP code drives a deterministic KDF input that wraps the master key.                                                                      |
| WebAuthn / Passkeys          | <https://www.w3.org/TR/webauthn-3/>                               | Passkey unlock. The user's authenticator returns a credential; we use its `prf` extension (or its raw secret on platforms where prf is unavailable) as the KDF input.    |
| Matrix Secure Secret Storage | <https://spec.matrix.org/v1.10/client-server-api/#secret-storage> | Conceptual model — multiple wrap entries per data-encryption key, one per unlock method.                                                                                 |
| Tutanota recovery codes      | <https://tuta.com/blog/recovery-code/>                            | Inspiration for the "recovery code" unlock method — a high-entropy printable string that wraps the data key.                                                             |
| Telegram tombstones          | <https://core.telegram.org/api/updates#deletes>                   | Soft-delete pattern — Telegram itself keeps deleted message ids on the wire; we keep them on disk too.                                                                   |

## Why no new runtime dependency

Node's `crypto` module already provides `aes-256-gcm`, `scrypt`,
`pbkdf2` and (on Node ≥ 22) `argon2id` via `crypto.argon2`. The
`webcrypto` namespace covers the same primitives in the browser. The
soft-delete + vault implementation in this PR sticks to those.

The optional `axe-core` and `playwright` peer-deps from PR #2 are
unrelated; we do not touch them.
