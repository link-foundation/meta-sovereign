---
'meta-sovereign': patch
---

Preserve validated dependencies when synchronizing release versions. Use npm's version metadata update in both changeset and instant releases instead of rebuilding the lockfile with legacy peer dependency resolution.
