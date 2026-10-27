# Chat loading and local data

The default app is [GitHub Pages](https://link-foundation.github.io/meta-sovereign/). A local JavaScript server supplies your messages and connected accounts; its localhost UI is optional. See [server setup and security](LOCAL-SERVER-SECURITY.md).

The Pages entry uses content-versioned script and stylesheet filenames, so reopening the latest build does not reuse an older interface from the browser cache.

If startup discovery fails, the hosted app retries after 5, 10, 20 and then every 30 seconds. Returning to the tab, making it visible or regaining network connectivity starts an immediate check. Checks never overlap; finding the server reloads the app once. Discovery and availability checks use `GET /api/status?probe=1`, a small identity response that never scans messages, aggregates contacts or verifies the store. Older servers can answer with their regular status response. Full statistics stay at `/api/status`; callers share one in-flight computation even when sync writes arrive, and a slow statistics request alone does not mark the server offline. Verification recognises the live binary mirror’s reads from the same authoritative text store, avoiding a second scan and repeated serialization of identical records. Independent stores still receive a full comparison. A failed browser connection does not mean the server process stopped. The offline notice describes the connection state and ongoing retries; passcode checks go only to a discovered local server.

## Opening and reading a conversation

A cached preview stays visible while the chat loads. A status above the messages explains foreground loading, background history, interrupted connections and Telegram's requested wait, including a retry countdown. Completed short conversations say **All available messages loaded** in the header. A short conversation can legitimately contain only a few messages; that completion state comes from the history returned by Telegram, not from the number of cached previews.

Opening a chat gives its requests `view` priority. A queued prefetch for that chat is promoted, and concurrent reads of the same page share one request. The background reader prioritises the open conversation before enumerating the entire chat list, while the app renews that preference every 30 seconds until the history is complete. Switching chats changes the foreground preference; abandoned views stop their retries. Telegram's rate limits still apply: the server respects the wait and returns HTTP 429 with `Retry-After` rather than reporting a gateway failure.

You can keep composing while history loads. Older pages load as you approach the top, and the partial-history notice also offers **Load earlier**. Cached messages and history coverage remain on disk, so a restart resumes missing history instead of discarding what was downloaded.

## Operator and navigation counts

**Operator** opens one unread conversation card at a time, without the chat list. The card includes history, unread context and the normal reply composer. **Next (N)** leaves it unread and moves to the next conversation; **Done (D)** acknowledges the displayed message boundary and advances only after the server succeeds. A failed acknowledgement keeps the card with a retry message. Typing in a field never activates these shortcuts. New unread conversations enter the queue live; a finished queue says “No unread conversations.” Monochrome circles beside Chat, Calls and Operator show unread messages, unread missed calls and waiting conversations. Zero counts are hidden; Calls uses “+” when older call history remains beyond the loaded recent page, and opening Calls acknowledges its notifications in this browser.

## Folders and panel widths

Named Telegram folders keep their own row, order and unread counts. The global **All** tab is last by default. **Settings → Folder tabs → Always show “All” first** moves it first in this browser without changing the remote Telegram folder order. On startup, folder updates and column resizing, the strip scrolls horizontally to reveal the selected tab; a remembered named-folder selection is preserved. A second row provides **All / Private / Groups / Channels** inside every selected folder, including All. Folder and type choices are independent and remembered; narrowing a folder never silently switches to a global list. The same type selection applies to archived items when browsing the archive.

On desktop, drag the vertical dividers to change the navigation, chat-list and open-details column widths. Widths are saved in this browser. Focus a divider and use the arrow keys; Home and End choose its bounds. Double-click or press Enter to reset its width. Compact phone layouts keep their single-column navigation.

**Calls** is a main-menu section immediately after Chat; it shows recent and missed Telegram calls. Clicking a call opens that person's chat. Telegram's own account editor is under **Profile**. Default dark-theme controls use white SVG icons and neutral surfaces; contact photos, message content and meaningful status colours remain available.

## Durable application folder

The JavaScript CLI and server use a per-user folder, independent of the directory where the command runs:

| System  | Default store                                        |
| ------- | ---------------------------------------------------- |
| macOS   | `~/Library/Application Support/Meta Sovereign/store` |
| Windows | `%APPDATA%/Meta Sovereign/store`                     |
| Linux   | `${XDG_CONFIG_HOME:-~/.config}/Meta Sovereign/store` |

Messages, contacts, account sessions, sync cursors, history coverage, media, TLS material, logs and the application's browser profiles stay under that store. Desktop shells use `<userData>/store`. User-selected exports and explicit `--profile` paths remain where you choose. `--store=<directory>` and `META_SOVEREIGN_STORE_DIR` override the default.

Starting `serve` or `trust` from a checkout containing an older `.meta-sovereign` store migrates it once to the user folder. The operation takes the existing writer lock, moves the complete directory, preserves the certificate and protected key, and leaves a compatibility directory link so old media paths keep working. A running writer prevents migration. Two existing databases are never merged or overwritten: startup explains the conflict and asks you to select one with `--store`. The automatic move requires both locations on the same filesystem; otherwise the original data remains intact and an explicit store path can be used. An unused destination directory is preserved with a `.before-migration-<timestamp>` suffix.

The standalone CV browser also uses this application folder. Its older default browser profile is moved when next opened, with a compatibility link; an existing `SingletonLock` prevents moving a profile still in use.

## Diagnostics and verification

The main log is `<store>/logs/meta-sovereign.log`, rotated by size. Refused requests include the origin, HTTP/HTTPS transport and Fetch Metadata site classification, without cookies, tokens or query strings. Late or duplicate WebRTC answers from another tab are ignored after negotiation; unexpected SDP failures are handled and retained as `client_rtc_negotiation_failed` warnings rather than unhandled promise rejections. A denied foreign origin is an access decision. Telegram waits are reported as waits; unexpected errors retain failure severity. Avatar retries are counted as informational pending media while retrying, with terminal resource failures retained as warnings.

Regression coverage includes a single cached message with delayed history, Telegram wait/retry, concurrent prefetch/open, focused backfill, every folder's type filters, column resizing and saved widths, Calls/Profile navigation, message sending with fixtures, store migration, certificate preservation and repeated store reopening. Chromium and WebKit exercise the browser flows. Automated sends use fixtures and do not send messages to personal contacts.
