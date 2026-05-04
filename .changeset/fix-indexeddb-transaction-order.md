---
'meta-sovereign': patch
---

Fix IndexedDB snapshot persistence so transaction completion handlers are attached before write requests start. Also close idle HTTP keep-alive sockets during local server shutdown so Deno test jobs do not wait for runtime-specific idle expiry.
