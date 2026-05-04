---
'meta-sovereign': patch
---

Fix IndexedDB snapshot persistence so transaction completion handlers are attached before write requests start. Also make HTTP and TCP sync shutdown deterministic by closing idle server sockets, invoking transport disconnect cleanup, and waiting for TCP socket close events.
