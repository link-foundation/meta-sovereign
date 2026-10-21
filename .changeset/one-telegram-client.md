---
'meta-sovereign': patch
---

R-Y62: a stuck Telegram request no longer leaves Telegram clients behind. Readers that ask for a connection at the same time now share one, and a dropped client is destroyed: GramJS's `disconnect()` kept its update loop running, which reconnected it, so every stuck request added clients that each handled every update until the server ran out of memory.
