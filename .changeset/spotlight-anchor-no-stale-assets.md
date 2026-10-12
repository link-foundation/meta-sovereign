---
'meta-sovereign': patch
---

The tutorial's highlight now stays on the menu button while the menu
scrolls (CSS anchor positioning instead of coordinates copied after each
scroll, which trailed one frame behind). The server makes browsers
revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
Safari no longer keeps running an old version after an update.
