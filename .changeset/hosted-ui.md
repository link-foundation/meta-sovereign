---
'meta-sovereign': minor
---

The hosted app on GitHub Pages is the default UI: `serve` prints its address and the app finds the server on port 8787 by itself, and `serve --local-ui=false` (or `MS_LOCAL_UI=off`) stops serving the local copy, sending `/` to the hosted app; `--ui-url` names another hosted copy. A browser test compares the hosted copy with the local one and runs after every Pages deploy (R-O14, R-Y58, R-Y59). Questions are compared by a temporary word grammar until formal-ai can do it (R-Y57).
