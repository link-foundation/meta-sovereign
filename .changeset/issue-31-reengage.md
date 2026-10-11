---
'meta-sovereign': minor
---

Re-engage personal contacts after a long silence (issue #31): find 1:1 chats with no messages for 90+ days, detect from the dialog whether "ты" or "вы" was used (regex rules, extensible through `pattern:*` links), prefill the matching default text, and send one confirmed message at a time in safe mode — from the new Re-engage screen, the `reengage` CLI command (`--interactive`, `--mode=batch --confirm=true`) or `POST /api/reengage/{plan,send,mark,run}`.
