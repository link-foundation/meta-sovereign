# Independent recovery dumps

Issue 56 asks for regular text **and** binary Links Notation dumps alongside link-cli storage. Existing `.msbk` archives stream the text log through gzip and authenticated frames; the binary database snapshot is not an independent recovery export. A regression requesting both formats originally returned no recovery files (`recovery-before.log`).

`makeBackup` now accepts `recoveryFormats: ['text', 'binary']`. It first writes and verifies the existing archive, then streams both independent dumps from that same immutable recovery point. Neither path queries the whole live database when a log exists. Each file is written privately through a temporary file, fsynced, renamed and read back completely. A failed pair is removed; earlier recovery points remain. Existing encrypted archives and legacy JSON restore stay available.

Raw dumps always exclude `secret:*` records, including secret tombstones. An encrypted archive remains necessary to recover credentials. They can still contain private messages and should be stored privately. A SHA-256 detects damage; it does not authenticate an attacker-controlled file.

## File model

Text starts with `MSDUMP1T` and a newline, then one `text/lino-line` object per line. Binary starts with `MSDUMP1B` and a newline, then repeated four-byte big-endian lengths and published `application/lino-binary` typed-object packets. Packets are bounded at 4 MiB; a larger declared length is rejected before payload allocation. Each representation uses the same model:

- First: `{ kind: 'manifest', format: 'meta-sovereign-recovery', version: 1, createdAt, schema, secrets: 'excluded' }`.
- Records: `{ kind: 'record', value: <original link or tombstone> }`.
- Last: `{ kind: 'end', lines, secretsExcluded, sha256 }`.

The hash covers the magic and every encoded packet before the end packet, including binary length prefixes or text newlines. Truncation, trailing data, malformed records, unknown versions and mismatched hashes fail verification. Readers retain only a bounded packet and stream buffer.

Both formats use the existing checked-before-write restore path, ordered replay, tombstones, batches and schema compatibility checks. Folder replacement also preserves existing secrets and keeps the replaced log; its binary snapshot is rebuilt. Retention is separate for each format and removes older points only after the newest file of that format verifies.

## Focused evidence

`js/tests/backup-recovery.test.js` covers independently restoring both formats, Unicode/nested values/large numeric types, secret exclusion from encrypted source archives, corruption without target mutation, streamed updates and tombstones without a live-store query, bounded malicious lengths, failed-pair cleanup, per-format retention and atomic folder replacement with local secrets preserved. The initial regression fails before implementation; all seven cases pass afterward. Existing plain, encrypted and legacy restore checks also exercise the shared stream-reader refactor. Full runtime and large-store coverage remains in CI.

CLI/API/UI scheduling controls are the next dependent implementation step; this document describes the storage primitive, not completion of R-AA17 or issue 56. Related work: [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
