---
'meta-sovereign': patch
---

R-Y73: the message menu opens on a right-click anywhere on the message's row, beside the bubble too, as in Telegram Desktop. In Safari, which selects the word under a right-click before the page sees it, that word is let go and the message's own menu opens (Reply, Copy, Copy Link, Forward, Delete, Select) instead of the text-selection one. The selection end-to-end test runs in WebKit (`E2E_BROWSER=webkit`) as well as Chromium.
