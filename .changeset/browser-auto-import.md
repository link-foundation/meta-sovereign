---
'meta-sovereign': minor
---

Add "Import with browser" to every service in Connections: the local JS
server (Node.js 22.12+) opens the service in a real Chrome window via
browser-commander, keeps a per-service signed-in profile, imports every
downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
accept requests only from the app itself or allow-listed origins.

The first tutorial step now names example services (Telegram, WhatsApp,
Gmail, …), and all tutorial copy is shorter and easier to read. Docker
images move to Node.js 24 so browser import works there via
`MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.
