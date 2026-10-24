---
'meta-sovereign': patch
---

Store file renames (compaction, durable writes, export and cache files) now retry on Windows when antivirus or the indexer holds the file open (EPERM/EBUSY/EACCES, about a second in all). A compaction that still cannot rename leaves the old log intact, is reported, and is tried again 30 seconds later (R-Z19).
