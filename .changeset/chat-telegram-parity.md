---
'meta-sovereign': minor
---

Chat shows Telegram messages as Telegram's own apps do and keeps them in
step (R-Y34, R-Y35, R-Y36, R-Y28). Photos and link previews are shown
inline, along with the quoted reply, the forward header, "edited",
reactions, the pinned message and service lines (joins, pins, calls).
Messages can be replied to, forwarded and deleted from Chat. Pictures
are downloaded once from the stored message and kept in the app folder.

A message deleted or edited in another app now changes here too, in
groups and channels as well: each supergroup and channel is caught up
through its own update number (`updates.getChannelDifference`) instead
of a re-read of the chat list.

Telegram is asked less and in step. Requests are paced per priority
with a per-minute budget. A wait Telegram asks for holds that method
(briefly everything), then slows the queue for an hour, and is kept
across restarts. Chats are asked for by their stored address, and the
address book is read at most every six hours.

Automations no longer run on service messages or on history read ahead
from long ago.
