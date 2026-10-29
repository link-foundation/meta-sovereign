---
'meta-sovereign': patch
---

Detach and share cached media type names so small provider summaries cannot retain large file-reader buffers after the raw payload is packed. Add a small synthetic ownership regression to prevent the memory retention from returning.
