---
'meta-sovereign': patch
---

`/api/status`, which every page asks while looking for the server, is worked out once until the store changes instead of reading and verifying the whole store each time, so many open pages no longer keep a big store's server busy; the hosted page also waits longer for a busy server's picture.
