---
'meta-sovereign': patch
---

A web-UI send that fails while or after pressing Send is reported as "may have been sent" (`send-unknown`) and is never retried by the composer, so a message can no longer go out twice; the composer says so in every language.
