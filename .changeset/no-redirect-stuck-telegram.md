---
'meta-sovereign': patch
---

The hosted app no longer jumps to http://127.0.0.1 by itself: in Safari it names the server it found and links its own copy (R-Y60). A Telegram request that is never answered no longer stalls every other one (avatars, chat info, history), so the page's reads no longer pile up until it shows offline (R-Y62). After a failed read the app checks its server every 10 seconds and comes back online by itself (R-Y63). The Safari note shows only on https pages.
