# Saved message history

Chat and Operator share an **Edited messages → View** entry above the conversation when the server has captured an edit. A message's context menu also offers **Edit history**. The dialog shows the saved versions, newest first, preserving text and formatting. It loads older versions automatically as you scroll. Deleted messages keep their history too: open **Deleted messages → View**, then the saved versions of that message.

Deleted and edited message controls share one aligned history row. The row disappears when neither category has saved messages, and stays on one line with horizontal scrolling in a narrow pane.

## Capture while the browser is closed

The JavaScript local server records changes as it receives them. Its Telegram account connection, live update handler and catch-up processing run independently of the web app. Closing the browser does not stop capture. Keep the local server running and the account connected.

Before replacing content, the server saves the old and new versions in the application store. Identical echoes, read receipts, reaction counts and deletion markers do not create duplicate content versions. Reverting text creates a new version, retaining the intermediate changes. Writes are serialized: a failed history write prevents the replacement from being acknowledged, allowing the normal update recovery to retry it.

Capture starts with versions the server actually observes. Telegram's [edit update](https://core.telegram.org/constructor/updateEditMessage) supplies the new message; it is not an archive of every earlier version. Existing edited messages with no saved original explicitly say that earlier versions were not captured. Likewise, edits made while the server was stopped or disconnected can only be retained if the service still supplies them during [update recovery](https://core.telegram.org/api/updates). There is no way to reconstruct content the service never delivered.

## Local retention and attachments

Each version retains a complete copy of the observed message payload and its formatting and attachment metadata. Later upstream edits, deletion, disconnection or loss of API access do not remove these saved copies. Read history entirely from the local server; reconnecting Telegram is not required.

For Telegram attachments, bytes already present in the server's media cache are pinned when an edit or deletion arrives. They live in `<application-store>/media/history/`, outside the evictable Telegram cache, and can be viewed or downloaded from the history dialog. Replacing an attachment invalidates the old live cache entry so the current message displays the new file. History capture does not start a bulk download. Bytes that had not been downloaded before replacement or deletion cannot be recovered from metadata; the dialog makes that absence explicit.

Versions are stored as separate `message-version:` links with immutable message snapshots and a predecessor chain. They survive log replay, compaction, normal restarts and rolling writer handoff. They are included in link exports and store backups. To back up attachment bytes as well, include the application store's `media/history/` directory; the link backup alone contains their references and metadata.

Soft deletion retains versions. Explicitly erasing a message locally also erases its saved versions and their unshared pinned files. Existing external backups are unaffected. Raw link API writes cannot alter or individually delete revision links. History never creates duplicate messages, unread counts or learned reply suggestions.

There is no startup archive migration or archive scan for each edit. Capture happens incrementally on message writes. The primary account and additional Telegram accounts use their own application store and media directory.

## Local API

| Read                                           | Response                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/chat/edited?key=telegram:42`         | Up to 50 edited messages, `count` and `next`; use `before=<next>` for older pages. Includes edited messages later deleted. |
| `GET /api/chat/edited?key=telegram:42&count=1` | Count only, using the compact chat index.                                                                                  |
| `GET /api/chat/versions?id=msg:telegram:42:1`  | Up to 50 version records, current `message`, `count`, `partial` and `next`; use `before=<next>` for older versions.        |
| `GET /api/media/history/<sha256>.<ext>`        | Pinned bytes using the same app-origin and range checks as other saved media.                                              |

Additional accounts use the existing account scoping parameter on these reads. `partial: true` means the original versions were not captured; it does not invent earlier content or timestamps.

Focused regression coverage: `message-versions.test.js`, `message-versions-api.test.js` and `e2e-message-versions-browser.mjs`. These use temporary stores and fake Telegram updates, including capture with all browser clients closed, offline history viewing, deleted-message history, pagination, write failure and restart/compaction behavior. Full runtime and browser matrices run in GitHub CI/CD.
