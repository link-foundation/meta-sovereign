---
'meta-sovereign': minor
---

Safari keeps the hosted app on GitHub Pages from reaching the local server, so the server now serves a small picture (`/api/beacon.svg`) that the hosted page finds on our ports; it then opens the server's own copy of the app by itself, or says that copy is off. The browser test runs the hosted copy in WebKit too (R-Y60).
