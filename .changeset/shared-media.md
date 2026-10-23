---
'meta-sovereign': patch
---

A chat's profile column and its shared media (R-Y111), as Telegram Desktop: the header's button opens a column for any Telegram chat with its photo, name, status, @username and about text, then how many photos, videos, files, music, links, voice messages and GIFs it has (new `shared-counts` route, messages.getSearchCounters); each opens its list a page at a time (new `shared-media` route, messages.search with the kind's filter) — pictures as a grid, the rest as rows — and a click goes to the message in the chat.
