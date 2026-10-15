---
'meta-sovereign': patch
---

Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.
