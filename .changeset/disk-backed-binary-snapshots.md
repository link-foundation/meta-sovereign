---
'meta-sovereign': patch
---

Build binary snapshots with disk-backed deduplication and live-position indexes on runtimes with built-in SQLite, cap the worker heap and pace record processing more frequently.

Finalize Bun's prepared statements when closing an encoder so temporary database handles are released immediately on Windows.
