---
'meta-sovereign': minor
---

Chat now behaves like a real messenger. A message is sent exactly once: Send clears the box at once, a repeated request for the same message never posts it twice (a per-message `clientId` on the server and Telegram's `random_id`), and messages of a chat go out in order. Each of your messages shows its delivery (a clock while sending, ✓ sent, ✓✓ read), and a failed one says why, with Retry and Delete. New messages, edits, deletions, read receipts and typing from the connected Telegram account appear live through a new `GET /api/events` stream, each chat keeps its own draft, and the view offers "New messages ↓" instead of jumping while you read.
