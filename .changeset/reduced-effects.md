---
'meta-sovereign': patch
---

The page stays usable when the browser renders slowly (software-rendered WebKit on Linux): a bounded frame-time probe and Settings → Appearance → "Reduce visual effects" (auto/on/off, `?effects=reduced`) set `html[data-effects="reduced"]`, which drops backdrop blur, the tutorial's page-sized dim and non-essential animations; the Linux WebKit e2e step runs with it forced to show whether slow compositing was the cause (R-Z21).
