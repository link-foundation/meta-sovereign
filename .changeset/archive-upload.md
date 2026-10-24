---
'meta-sovereign': patch
---

The Connections import box streams any export file to the local server (`POST /api/archive/upload`): a Facebook, X or LinkedIn zip is read by its own importer instead of the WhatsApp one, and a WhatsApp export is no longer capped at 64 MB (R-Z23).
