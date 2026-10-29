---
'meta-sovereign': patch
---

Reduce server heap retention by packing cold provider payloads, streaming compaction and binary snapshots, and bounding autocomplete history and context. Pace background snapshots, avoid payload copies in metadata scans, and expose constant-cost memory diagnostics.
