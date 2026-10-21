---
'meta-sovereign': minor
---

R-Y70: reply suggestions while typing come from the browser's own copy of the reply index, kept on the associative stack. The server gives the index as links (`reply-link`, `sent-link`, `word-link`, `spelling-link`, `chat-link`, `last-link`) at `/api/suggest/model` — compressed JSON or Links Notation (`?format=lino`), pruned to what a browser needs — and, to a copy holding a version, only the messages it learned since (`?since=`). The browser keeps the copy in its links storage (IndexedDB, or doublets-web when present), suggests from it at once (also after a reload and offline), catches up when the live stream says something arrived, and adds the server's rarer suggestions once typing pauses.

R-Y71: typing, scrolling and opening chats stay smooth with thousands of chats. A keystroke re-renders only the message box and its suggestions (no long tasks while typing, down from ~260 ms per key), the chat list renders a page of rows and grows as it is scrolled, rows re-render only when their chat changes, and rows out of sight are not laid out (list scroll frames ≤ 18 ms with 3000 chats, down from 119 ms).
