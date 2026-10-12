---
'meta-sovereign': minor
---

Connections now leads with the easiest route. Every service card has an
"Import with browser" button marked Recommended (manual "Set up" stays
next to it), the provider page shows that import first and the manual
steps under "Or connect by hand", and services are sorted by how many
people use them, so Email comes first and the tutorial suggests it.

New "Use your browser sign-ins" panel (browser-commander): "Find
sign-ins" lists every installed browser profile (Chrome, Safari,
Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
to, reading only site names; "Use these sign-ins" copies those services'
cookies into an owner-only file so the next import window opens signed
in, then deletes the copy. On macOS the panel detects missing Full Disk
Access for Safari, names the app to allow and opens the System Settings
pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.
