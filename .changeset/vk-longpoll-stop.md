---
'meta-sovereign': patch
---

Stopping the server also waits for a VK live-update batch in flight to be stored, so it can no longer write after the final flush; a restarted VK live loop never runs next to the old one.
