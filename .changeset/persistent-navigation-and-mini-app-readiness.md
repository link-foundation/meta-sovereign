---
'meta-sovereign': patch
---

Restore the current app section, conversation/provider detail, Operator card and section scroll after reloads and browser Back/Forward. Share routing across menus and cross-component links, avoid duplicate visits, and preserve saved Operator selection while its directory loads.

Exclude bots from Operator by default with a separate persistent opt-in shared by queue and badge. Preserve bot identity from live and exported messages. Accept Telegram SDK empty-string ready/request events, initialize iframe handshakes, and replace endless Mini App loading with timeout, retry and manual browser fallback while retaining frame/origin validation.

Clear a stale scroll-request failure marker when foreground history finishes successfully, so a completed conversation does not keep displaying an interrupted-connection indicator.
