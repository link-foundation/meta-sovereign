# Case Study: Issue #6 — Improvements and hardening system from data loss or unauthorized access

**Issue:** [#6 — Improvements and hardening system from data loss or unauthorized access](https://github.com/link-foundation/meta-sovereign/issues/6)
**Author:** [@konard](https://github.com/konard)
**Status:** Implemented in PR #7
**Pull Request:** [#7](https://github.com/link-foundation/meta-sovereign/pull/7)

This case study collects every directive from issue #6, decomposes it
into atomic requirements, surveys the prior art and libraries that
help, and records the solution plan that PR #7 implements against the
local-first / privacy-first design constraints already established in
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) (see section **K**).

The artefacts in this folder are:

| File                   | Purpose                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `README.md`            | This document — case study analysis.                                                                         |
| `requirements.md`      | Atomic requirement list extracted from the issue.                                                            |
| `solution-plan.md`     | Phased plan mapping requirements to concrete deliverables in this PR.                                        |
| `components.md`        | Catalogue of upstream libraries / standards that informed the design.                                        |
| `external-research.md` | Summary of external research about soft-delete, encrypted-at-rest, master keys, passkeys, encrypted exports. |
| `data/`                | Raw artefacts (issue body, comments) used to build this study.                                               |

---

## 1. Vision (paraphrased from the issue)

The personal data that meta-sovereign stores about the user and their
contacts is the most sensitive surface of the whole system. Issue #6
makes two demands of that surface:

- **No accidental data loss.** A delete on the upstream service (e.g.
  Telegram, VK) must not silently destroy our local copy. The system
  must mark messages as deleted by default and only ever physically
  remove them when the operator confirms.
- **No accidental data leak.** Everything the system writes to disk
  must be encrypted at all times; only the live in-memory working set
  is plaintext. Master-key access has to support multiple unlocks
  (passphrase, PIN, passkey, authenticator-app TOTP) so the user can
  add or rotate methods without re-encrypting the whole database.
  Exports leave the system encrypted, with an explicit warning that
  the user owns the resulting file.

The two goals reinforce each other: backups stay friendly even when
upstream services lose data, and even when those backups are stolen
they remain unreadable without the master key.

## 2. Why this case study exists

The issue explicitly requests:

> _We need to collect data related about the issue to this repository,
> make sure we compile that data to `./docs/case-studies/issue-{id}`
> folder, and use it to do deep case study analysis (also make sure to
> search online for additional facts and data), list of each and all
> requirements from the issue, and propose possible solutions and
> solution plans for each requirement (we should also check known
> existing components/libraries, that solve similar problem or can
> help in solutions)._

This document is the central deliverable of that request.

## 3. Method

1. **Source extraction** — issue body and comments captured via `gh`
   to `data/issue-6.json` / `data/issue-6-comments.json`.
2. **Requirement decomposition** — see `requirements.md`. Each item
   carries a stable `R-K*` identifier so changesets, PRs, and code
   comments can reference it.
3. **Component survey** — see `components.md`. Catalogues the existing
   in-tree primitives (`wrapSecretStore`, `encryptBackup`,
   `createBackupScheduler`, `createPeer`'s secret filter) plus the
   upstream standards we follow (WebAuthn / passkeys, RFC 6238 TOTP,
   Argon2id KDF, AES-256-GCM, scrypt).
4. **External research** — see `external-research.md`. Pulls in
   prior art from Signal's sealed-sender + safety-numbers, Tutanota's
   recovery codes, Bitwarden's emergency access, Apple's iCloud
   Keychain recovery contacts, and Matrix's Secure Secret Storage
   (SSSS).
5. **Plan synthesis** — `solution-plan.md` maps each `R-K*` item to a
   concrete change in this PR.

## 4. Headline findings

- The repository **already has** AES-256-GCM at-rest encryption for
  `secret:*` links (`wrapSecretStore`) and AES-256-GCM at-rest
  encrypted backups (`encryptBackup`/`decryptBackup`). The hard part
  was missing: a **soft-delete tombstone protocol** and a **master-key
  unlock indirection** so the same on-disk material can be unlocked by
  multiple methods without rewriting the database.
- The issue's "do not actually delete by default" requirement is
  cleanly modelled as a **tombstone link** — the link stays in the
  store with `deleted: { at, by, reason }` set, and `delete()` becomes
  a soft-delete by default. A `purge()` API performs the physical
  delete only after explicit operator confirmation. This pattern is
  identical to what Telegram Desktop and Tutanota do internally.
- For multi-method unlocks the cleanest model is **wrap-the-master-key**:
  generate a single 32-byte data key per vault, keep it in memory, and
  store one ciphertext copy per unlock method (passphrase, PIN, passkey
  blob, TOTP recovery code). Adding a method just appends another
  ciphertext entry. Removing one removes the corresponding entry. The
  data on disk does not move. Matrix Secure Secret Storage and Apple
  iCloud Keychain follow the same shape.
- For exports we keep using the existing AES-256-GCM envelope but
  expose a CLI subcommand and an HTTP endpoint that **always** require
  a passphrase (no plaintext export by default), and we attach a short
  human-readable warning to the exported envelope so any tool that
  prints the JSON shows the responsibility statement first.

The complete reasoning — including library URLs and trade-offs — is in
`external-research.md` and `components.md`.

## 5. Constraints honoured

- **Public domain / Unlicense** licensing across the project.
- **No premature optimisation**; the soft-delete tombstone is a
  one-field convention, the vault is a 200-line module with no new
  runtime dependencies (Node `crypto` only).
- **Backwards compatible**: existing deletions still work via
  `store.delete(id)`; the change is purely additive (a `purge` API and
  a `softDelete` flag) so PR #2 stores keep working.
- **Tested**: every new code path has a unit test, including the
  multi-method vault unlock and tombstone round-trip.

## 6. Current Status

Implemented in PR #7. The full requirement → status mapping is
maintained at the top-level
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) under the new
section **K. Hardening (issue #6)**.

---

## 7. References

The full bibliography is in `external-research.md`. Key entries:

- _Local-first software_ — Kleppmann et al., Ink & Switch, 2019. <https://www.inkandswitch.com/essay/local-first/>
- WebAuthn / Passkeys — <https://www.w3.org/TR/webauthn-3/>
- RFC 6238 — TOTP — <https://datatracker.ietf.org/doc/html/rfc6238>
- Argon2 password hashing — <https://datatracker.ietf.org/doc/html/rfc9106>
- Matrix Secure Secret Storage — <https://spec.matrix.org/v1.10/client-server-api/#secret-storage>
- Tutanota recovery codes — <https://tuta.com/blog/recovery-code/>
- Apple iCloud Keychain recovery contacts — <https://support.apple.com/guide/security/account-recovery-and-recovery-contacts-secdeb202947/web>
- Telegram cloud-deleted-message semantics — <https://core.telegram.org/api/updates#deletes>
- Signal sealed sender — <https://signal.org/blog/sealed-sender/>
