---
'meta-sovereign': patch
---

Tests: the Deno run no longer fails on a store that was never written (the snapshot worker finds no log and has nothing to save) or on GramJS's part-size check, which is now tested without importing GramJS.
