# Archive verification

Two consecutive rebuilds over unchanged inputs produced the same SHA256. Extracting into a new temporary directory and checking evidence-files.sha256 verified all 658 files. Both archive and inventory hashes are in evidence.sha256.

Archive SHA256: `8c6596fccbb82ee532ec717672539601905c5658a53b11c6fb8036f4bcc3033d`. The archive is a pre-final-push evidence snapshot; final-head and default-branch CI conclusions are linked from PR51 after those runs finish. No pending run is counted as passing by this snapshot.

The supplemental release-evidence archive was refreshed after the failed repair matrix. Its 82 files include the failed main release, failed Bun/macOS run, focused reproductions and fixes, upstream report inputs, and October 29 Node/npm/tool metadata refresh. Every extracted file and both archive/inventory checksums pass. The original 658-file snapshot remains unchanged. Latest supplemental hashes are in `release-evidence.sha256`; final source CI results are linked from PR 51 after the run.
