---
'meta-sovereign': minor
---

Add "Import with browser" to every service in Connections: the local JS
server opens the service in a real Chrome window via browser-commander,
keeps a per-service signed-in profile, imports every downloaded export
(ZIP / tar.gz unpacked) and can capture the open chat in Telegram Web
and WhatsApp Web. New `/api/auto-import` routes accept requests only from
the app itself. The first tutorial step now names example services
(Telegram, WhatsApp, Gmail, …) and all tutorial copy is shorter and
easier to read. All dependencies are upgraded to their latest versions
(browser-commander 0.31, ESLint 10, Electron 44, Capacitor 8), which
raises the minimum Node.js version to 22.22.1.
