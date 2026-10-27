---
'meta-sovereign': patch
---

Avoid scanning and serialising the complete archive twice when verifying the live binary mirror, whose logical reads delegate to the same authoritative text store. Keep full comparison for independent stores. This prevents full status requests in older browser tabs from blocking discovery and chat requests on large archives.
