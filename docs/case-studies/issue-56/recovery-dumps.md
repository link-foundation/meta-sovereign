# Independent recovery dumps

Issue 56 asks for regular text **and** binary Links Notation dumps alongside link-cli storage. Existing `.msbk` archives stream the text log through gzip and authenticated frames; the binary database snapshot is not an independent recovery export. A regression requesting both formats originally returned no recovery files (`recovery-before.log`).

The file-backed JavaScript server creates both dumps alongside its archive by default, every 24 hours, retaining three copies of each format. The first automatic run follows the chosen interval. `makeBackup` accepts `recoveryFormats: ['text', 'binary']`; its library default remains archive-only for existing callers. It first writes and verifies the existing archive, then streams both independent dumps from that same immutable recovery point. Neither path queries the whole live database when a log exists. Each file is written privately through a temporary file, fsynced, renamed and read back completely. A failed pair is removed; earlier recovery points remain. Existing encrypted archives and legacy JSON restore stay available.

Raw dumps always exclude `secret:*` records, including secret tombstones. An encrypted archive remains necessary to recover credentials. They can still contain private messages and should be stored privately. A SHA-256 detects damage; it does not authenticate an attacker-controlled file.

## File model

Text starts with `MSDUMP1T` and a newline, then one `text/lino-line` object per line. Binary starts with `MSDUMP1B` and a newline, then repeated four-byte big-endian lengths and published `application/lino-binary` typed-object packets. Packets are bounded at 4 MiB; a larger declared length is rejected before payload allocation. Each representation uses the same model:

- First: `{ kind: 'manifest', format: 'meta-sovereign-recovery', version: 1, createdAt, schema, secrets: 'excluded' }`.
- Records: `{ kind: 'record', value: <original link or tombstone> }`.
- Last: `{ kind: 'end', lines, secretsExcluded, sha256 }`.

The hash covers the magic and every encoded packet before the end packet, including binary length prefixes or text newlines. Truncation, trailing data, malformed records, unknown versions and mismatched hashes fail verification. Readers retain only a bounded packet and stream buffer.

Both formats use the existing checked-before-write restore path, ordered replay, tombstones, batches and schema compatibility checks. Folder replacement also preserves existing secrets and keeps the replaced log; its binary snapshot is rebuilt. Retention is separate for each format and removes older points only after the newest file of that format verifies.

Recovery encoding preserves the storage codec's `undefined`, `NaN` and infinity values. Reusing the network encoder initially normalized those values and lost fields; the extended restore regression fails against that implementation (`recovery-types-before.log`). The shared encoder now exposes lossless Lino value encoding separately, while HTTP retains its established normalization. Both dump formats pass exact-value comparison after restore, including large Number values.

## Configuration and control surfaces

The Backup page exposes interval, retention and independent text/binary choices. Zero hours disables automatic backups; zero retained copies keeps all; unchecking both formats retains archive-only operation. Settings are stored as `config:recovery` and survive restart. Saving waits for any previous backup to finish before replacing its timer. A failed persistence write leaves the old schedule running. Explicit startup options override saved settings, which otherwise override environment/default values. Intervals are bounded by the JavaScript timer limit (596 hours); retention is an integer from zero to 10,000.

CLI examples (use a separate store or stop its writer before changing configuration):

```sh
meta-sovereign backup-config --store=./store --interval-hours=24 --keep=3 --formats=text,binary
meta-sovereign backup --store=./store --archive=./archives
meta-sovereign restore --store=./recovered --file=./archives/recovery-EXAMPLE.lino.bin --replace
meta-sovereign serve --store=./store --backup-interval-hours=12 --backup-keep=5 --recovery-formats=text,binary
```

`backup-config` without updates reads the settings. `--formats=none` selects archive-only operation. One-off backups use the saved format/retention choices unless overridden. `restore` supports either dump or an existing archive; `--passphrase` supports encrypted archives. Merge restore closes its owned store before returning, and folder replacement requires exclusive ownership.

The API uses the production Lino transport: `GET /api/backups/settings` reads capabilities/settings; `POST` saves `{ intervalHours, keep, formats }`. `POST /api/backups` creates the archive and selected dumps, returning filenames, formats, counts, secret policy and hashes. `GET /api/backups` identifies each file's format. `POST /api/backups/restore` accepts its filename and optional archive passphrase. Invalid settings fail before changing the schedule. File paths remain server-side. `MS_BACKUP_INTERVAL_HOURS`, `MS_BACKUP_KEEP` and `MS_RECOVERY_FORMATS` configure defaults.

The page uses shared loading/retry behavior, preserves server failure messages and reports success only after a confirmed result. Restore requires confirmation and explains that matching IDs are overwritten. A browser-only server without a configured archive folder reports recovery unavailable and hides disk operations. Narrow screens wrap long filenames. The screenshots show the previous page and new controls against the same isolated backend/recovery files, plus the final 390-pixel mobile layout; no provider account or running user application is involved.

## Focused evidence

`js/tests/backup-recovery.test.js` covers independently restoring both formats, Unicode/nested values/large numeric types/nonfinite values/undefined, secret exclusion from encrypted source archives, corruption without target mutation, streamed updates and tombstones without a live-store query, bounded malicious lengths, failed-pair cleanup, per-format retention and atomic folder replacement with local secrets preserved. The initial regression fails before implementation; all seven cases pass afterward. Existing plain, encrypted and legacy restore checks also exercise the shared stream-reader refactor.

`js/tests/recovery-controls.test.js` exercises the actual binary Lino API, settings validation, live timer replacement, both scheduled dumps, restart persistence, CLI configuration, backup and both folder/merge restore paths. The exclusive-lock assertion catches the previous CLI merge restore retaining its writer; `experiments/issue-56/reproduce-cli-restore-lifetime.py` reproduces that failure with guaranteed source restoration. Existing nine automatic-backup wiring cases also pass.

`js/tests/e2e-backup-browser.mjs` uses Chromium with actual isolated recovery files: save/reload, create both dumps, confirmation before restore, restored data, failure messages, unavailable capability and mobile overflow. It passes locally and is registered in the existing Chromium/WebKit CI runner. The full runtime and large-store coverage remains in CI. Focused logs are preserved in `data/recovery-controls.tar.gz` with a verified hash manifest.

This completes the JavaScript file-backed recovery implementation; browser-only/native/mobile storage parity and all other open issue requirements remain tracked independently. Related work: [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
