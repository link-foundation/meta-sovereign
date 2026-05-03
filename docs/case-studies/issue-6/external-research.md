# External research — issue #6

Notes from the wider literature on soft-delete, encryption-at-rest,
master-key wrapping, multi-method unlocks, and encrypted exports. The
goal is to validate the design choices in `solution-plan.md` against
established practice rather than invent anything new.

## 1. Soft-delete tombstones

- **Telegram cloud chat semantics.** Telegram's MTProto reports
  message deletes via `updateDeleteChannelMessages` /
  `updateDeleteScheduledMessages`. The protocol carries the deleted
  message id forever; clients render the gap as "this message was
  deleted" rather than physically reusing the id. Source:
  <https://core.telegram.org/api/updates#deletes>.
- **Tutanota.** Stores all messages with a `deleted` flag and only
  purges when the user empties the trash. The encryption layer treats
  trash and inbox identically. Source:
  <https://tuta.com/blog/email-encryption/>.
- **Notion / Linear.** Use a `deletedAt` field rather than physical
  delete; recovery is a UI affordance.
- **CRDTs.** "Tombstones" are the canonical CRDT mechanism for safely
  propagating deletes between replicas without losing causal history.
  See Shapiro, Preguiça, Baquero, Zawirski — _Conflict-free Replicated
  Data Types_, 2011 (<https://hal.inria.fr/inria-00609399v1/document>).

**Conclusion:** soft-delete is mainstream; we model it as a regular
link upsert with `deleted: { at, by, reason }` so it round-trips through
sync and the existing handler bus already knows how to merge it.

## 2. Master-key wrapping with multiple unlocks

- **Matrix Secure Secret Storage (SSSS).** The user has exactly one
  default key (the "data key"). The data key is encrypted once per
  passphrase or per recovery key; the encrypted entries live in the
  account data and any device with any one passphrase can derive the
  data key. Source:
  <https://spec.matrix.org/v1.10/client-server-api/#secret-storage>.
- **Apple iCloud Keychain.** Each device wraps a copy of the keychain
  master key with a device-bound key; recovery contacts do the same.
  Source:
  <https://support.apple.com/guide/security/account-recovery-and-recovery-contacts-secdeb202947/web>.
- **Bitwarden emergency access.** Users grant additional public keys
  the right to unwrap the master key; the wrapping list is mutable
  without rotating the master key.
- **Signal "Storage Service".** Uses a single master key derived from
  the user's PIN, then wraps a per-record key under it.

**Conclusion:** the cleanest model is a single 32-byte data key wrapped
once per unlock method. Adding/removing a method is an O(1) append/
remove in the metadata file; no data is rewritten.

## 3. KDFs

- **scrypt** (already used by `encryptBackup`) — RFC 7914. Tunable but
  memory-bound; `N=2^14, r=8, p=1` is the in-tree default.
- **Argon2id** — RFC 9106. Modern recommendation from the Password
  Hashing Competition. Available in Node ≥ 22 via `crypto.argon2`. The
  PR keeps scrypt for the existing `secret:*`/backup envelope (so PR #2
  artefacts still decrypt) but defaults new vault wraps to Argon2id
  when the runtime supports it.
- **PBKDF2-SHA-256** — for compatibility with browser WebCrypto, where
  Argon2id is not yet ubiquitous.

## 4. Passkey / WebAuthn for unlocks

- **WebAuthn Level 3** introduces the `prf` extension which lets a
  relying party derive a deterministic 32-byte secret from a credential
  without ever revealing private key material. This is the canonical
  way to wrap a symmetric key under a passkey. Source:
  <https://w3c.github.io/webauthn/#prf-extension>.
- **Apple Passkeys**, **Google Passkeys**, **1Password** all support
  the `prf` extension as of 2024.
- The PR's vault stores a passkey unlock entry as
  `{ kind: 'passkey', credentialId, salt, ciphertext }`. The browser
  asks the authenticator for a 32-byte HKDF output keyed by `salt`,
  derives the wrap key, and decrypts `ciphertext` to recover the
  master key. Headless servers without WebAuthn keep their own
  passphrase-only entry alongside.

## 5. TOTP / authenticator-app unlocks

- **RFC 6238.** Defines the 30-second time-stepped HMAC-based one-time
  password.
- TOTP alone is too low-entropy to wrap a 32-byte key directly (only 10⁶
  values), so the design follows **Bitwarden two-step recovery**: the
  user generates a long, printable **recovery code** during enrolment;
  TOTP is just a confirmation factor. The recovery code (≥128 bits of
  entropy) is the actual wrap key input; the user can store the
  recovery code in their authenticator-app description field, on
  paper, or in a password manager. The PR exposes this as the `totp`
  unlock method.

## 6. Encrypted exports

- **VeraCrypt / age / GnuPG** are the user-facing standards for
  portable encrypted archives. age (`age-encryption.org`) explicitly
  supports passphrase-only and X25519-recipient modes; passphrase mode
  uses scrypt and ChaCha20-Poly1305.
- **iCloud Backup** and **Signal manual backup** both produce a single
  encrypted archive, attach a long passphrase to it, and warn the user
  that the file is now their responsibility.
- The PR re-uses the existing `encryptBackup`/`decryptBackup` envelope
  (AES-256-GCM, scrypt KDF, JSON-shaped) so the same passphrase
  decrypts both backups and exports. The export envelope adds a
  `warning` field so any tool that prints the JSON shows the
  responsibility statement first.

## 7. References

| Topic                      | URL                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Local-first software       | <https://www.inkandswitch.com/essay/local-first/>                                                  |
| CRDT tombstones            | <https://hal.inria.fr/inria-00609399v1/document>                                                   |
| Telegram deletes           | <https://core.telegram.org/api/updates#deletes>                                                    |
| Matrix SSSS                | <https://spec.matrix.org/v1.10/client-server-api/#secret-storage>                                  |
| Apple recovery contacts    | <https://support.apple.com/guide/security/account-recovery-and-recovery-contacts-secdeb202947/web> |
| Bitwarden emergency access | <https://bitwarden.com/help/emergency-access/>                                                     |
| Signal storage service     | <https://signal.org/blog/secure-value-recovery/>                                                   |
| RFC 9106 (Argon2)          | <https://datatracker.ietf.org/doc/html/rfc9106>                                                    |
| RFC 7914 (scrypt)          | <https://datatracker.ietf.org/doc/html/rfc7914>                                                    |
| RFC 6238 (TOTP)            | <https://datatracker.ietf.org/doc/html/rfc6238>                                                    |
| WebAuthn prf extension     | <https://w3c.github.io/webauthn/#prf-extension>                                                    |
| age encryption             | <https://age-encryption.org/>                                                                      |
| Tutanota recovery code     | <https://tuta.com/blog/recovery-code/>                                                             |
