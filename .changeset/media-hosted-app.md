---
'meta-sovereign': patch
---

R-Y72: photos, avatars, videos, voice messages and files show in the hosted app (GitHub Pages) again. The page asks for them as CORS requests, so the browser says which page asks, and the server lets the app's own origins have them while other sites still get none (before, every such load said only "cross-site" and was refused). A picture that does not load shows its blurred preview instead of a broken-image icon, Save As fetches the file before saving it, and failed or refused loads are counted in the log by route.
