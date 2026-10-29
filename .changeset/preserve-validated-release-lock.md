---
'meta-sovereign': patch
---

Preserve validated dependencies when synchronizing release versions. Use npm's version metadata update in both changeset and instant releases instead of rebuilding the lockfile with legacy peer dependency resolution.

Wait for the backup destination to close before removing a failed temporary write, including when Bun rejects an async-generator pipeline before its pending file open finishes.
