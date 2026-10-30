# Loading, media and Operator queue behavior

The chat directory indexes person records once per snapshot and reuses unchanged
summaries across unrelated live events. Opening an existing chat and searching
reuse that directory. Folder filtering and stable current callbacks preserve row
memoization. The list mounts the viewport and one screen of overscan on either
side, with measured chat/heading heights and spacer rows; scrolling does not
accumulate DOM nodes, avatar observers or media elements. Keyboard focus can
reach unmounted rows, and pinned drag indices refer to the full pinned order.
History prefetch observes actual row visibility; a hidden phone sidebar does not
enqueue background reads.

Chat-list and navigation resize handles extend 8px beyond the sidebar's right
edge, leaving its full content width and native scrollbar available. The hit area
is transparent until hovered, keyboard-focused or dragged; revealing it never
changes panel geometry or reserves spacing. The profile's left handle retains
its own gutter beside its controls. The navigation drawer scrolls its inner items
rather than its resize handle. Mouse scrollbar clicks, pointer resizing and
keyboard resizing remain separate interactions.

Avatar read-ahead covers one nearby scroll viewport with at most two uncached
loads at once; visible identities precede queued read-ahead. Granted images load
eagerly because visibility has already been checked. Completed avatars remain
visible when virtual rows remount. Initials are the quiet fallback during a cold
load or interruption, without repeated avatar spinners. The account-scoped URL
cache retains at most 512 entries; the server and HTTP cache retain image bytes.

Sending updates the composer, pending bubble and directory preview immediately.
The outbox remains responsible for persistence, ordering, retries and its stable
client ID. A local preview keeps a clock or failure indicator; only provider
acknowledgement replaces it with confirmed content. Scheduled messages remain
outside the live directory until sent, except when they fail.

Deleted-account status is distinct from deleted messages. Stored account flags
survive chat summaries, including cleared conversations. The list, Chat/Operator
header and profile use a muted deleted-user icon and localized label instead of
a numeric fallback name or a misleading last-seen status. An unnamed live
Telegram user remains distinct from a deleted one. Profiles label the numeric
identifier **Telegram user ID**, with a copy control; IDs are never inferred to
be phone numbers. Deleted identities do not repeatedly request an avatar.

Uncached message pictures and expired-reference refreshes use foreground queue
priority while retaining the account's pacing and flood holds. Concurrent reads
share download/cache work, and picture sizes share an active reference refresh.
Completed cache entries avoid Telegram entirely. Media diagnostics separate queue,
download and reference-refresh durations, byte counts and cache hits without
recording message contents or file references. Failed work releases its shared
entry so automatic recovery can retry.

An empty conversation uses a centered icon, title and muted helper in the usable
pane above the measured floating composer, in both Chat and Operator. Loading
and retry markers use that same region; active history requests do not also
claim there are no messages. The composer remains the action, keeps typing focus
and has room for suggestion chips. A draft or business introduction replaces
the generic empty state. See the pinned [reference review](CHAT-REFERENCES.md#empty-conversations-and-composer-clearance).

Long composer suggestions shorten in the middle so both the beginning and the
ending remain visible. Their previews adapt to pane width and typography without
splitting emoji or combining characters. Hover and accessible names expose the
complete message; choosing a suggestion fills the composer with its full text.
Chat and Operator use the same control. Deduplication compares normalized full
messages across browser/server suggestions, preserving choices with different
endings. The focused `e2e-suggestion-labels-browser.mjs` fixture checks resizing,
duplicate filtering, full insertion and short labels with synthetic messages.

Generated next-word predictions occupy a separate compact **Next word** strip.
Each chip shows the predicted word; its tooltip and accessible name identify it
as a prediction. A word-model frequency must never be shown as a use count for
the constructed full sentence. The historical reply/message choices keep their
full-message previews and actual use counts. Suggestions never change an empty
or typed draft when they load, refresh, receive focus or are hovered. Tab and
Shift+Tab move focus without inserting a suggestion. Clicking an option, or
pressing Enter/Space on its focused button, explicitly applies it. Word
completions must add at least three letters or digits; one- and two-letter
predictions and nearly finished words are omitted. A completed sentence has no
word strip until the user starts the next sentence with whitespace or text.
The browser applies the same filter to older server responses. Multiline
drafts grow the composer to its height limit, including after restore, suggestion
selection and pane resizing; the remainder scrolls inside the input.

Measured progress uses the same bounded value for the painted bar, text and
accessibility state. Transfer percentages never round up to 100% before the bytes
are complete, and bar animations cannot lag behind a numeric label. Attachment,
export and boost meters share a fill with visible track contrast across themes.
Unknown totals use an indeterminate indicator, with no invented 5% value;
confirmed completion fills the bar. Indeterminate animation respects reduced
motion. A 0% poll result has no filled bar. Transfer and confirmation stages
remain separate: a completed byte transfer is not proof of message delivery.

Conversation facts and question/answer summaries refresh without clearing the
last successful result. The About panel identifies partial history and links
topic continuations and friendship agreements to their source messages. Context
suggestions use the selected reply target, including an older answer, and are
labeled as context rather than historical usage counts. Their action fills the
composer only. Settings exposes default-on, persistent learning controls; the
disabled state replaces the derived panel without deleting source messages.
These rules apply to Chat and Operator; see
[conversation learning](CONVERSATION-LEARNING.md).

Page loaders occupy the available view below the header/navigation. A pane loader occupies its content pane. Operator retains its toolbar during initial directory loading and candidate validation, then places its empty state in the same remaining region. Calls follows the same rule for its loading and empty list. Inline action progress stays with the action; chat history uses its compact in-list marker. Profile actions use consistent gaps and widths, including controls rendered by separate components.

The header has one connection badge in every section: Online, yellow Reconnecting while a previously connected local server or Telegram transport is reconnecting, or Offline when no server has been found or the browser is offline. Telegram being unreachable for a minute also shows Offline with its reason; an expired session links to sign in. Existing event streams supply transport state without opening extra connections. Reconnecting notices never occupy conversation content; history and media show progress only for their own loads.

Failed reads remain in that loading region and retry automatically with bounded backoff and no attempt limit. Refresh failures retain the last successful content. The unlocked app keeps one outbox running across sections, waking it immediately on server recovery. A previously connected server or Telegram account suppresses the browser-only setup offer unless enabled in Settings; connection history survives reloads. See [connection recovery](CONNECTION-RECOVERY.md).

Media URL resolution is not proof that bytes have loaded. Pictures retain their reserved proportions and hide an undecoded full-size frame; photos, albums and the full-screen viewer display a centered loading indicator until decoding completes. Video, GIF and round-video loading follows browser readiness/buffering events. Audio/voice loading follows the player instead of disappearing when its URL becomes available. Stickers, previews, avatars and imported/remote pictures and players use the same readiness rules. Automatic-download settings still control when media is requested. Interrupted media keeps its loading indicator and retries automatically with bounded backoff, waking on restored connectivity; no manual retry button is needed. A missing avatar retains initials and its negative cache is reconsidered on connection recovery. User-paused or manually downloadable media is not presented as an active download.

Operator disables ordinary read receipts for its embedded chat independently of the app's normal read-receipt setting. Opening a card, reading its context, sending a reply and selecting **Next** do not acknowledge the conversation. **Next** moves the card behind the other waiting conversations. The postponed order survives navigation and reloads in the current tab; only completed work leaves that order; a Telegram read update alone does not complete opened work. **Done** acknowledges the displayed boundary only after a successful server response. On failure, the card and unread count remain. Completing another card does not jump back to skipped work before the remaining cards have been processed.

The About panel uses documented native `tg://resolve` username/phone links and `tg://privatepost` message links, without creating a blank browser tab. Numeric-only users still use an explicitly labeled Telegram Web link with a separate-sign-in explanation. Telegram's [deep-link specification](https://core.telegram.org/api/links) says that `tg://user?id` is not a normal client link. The official [macOS parser](https://github.com/TelegramMessenger/telegram-macos/blob/master/packages/TelegramLinks/Sources/TelegramLinks/LinkParsing.swift) does not recognize `openmessage` as a supported scheme. No unsupported numeric native link is invented. Opening the native app may display a browser/OS confirmation; its Telegram account must have access to the conversation.

Browser evidence: `e2e-loading-browser.mjs` compares loading/empty centers at desktop and phone widths; `e2e-media-loading-browser.mjs` delays real media responses, checks reserved geometry and decode/playback readiness, tests failures/retry and measures profile action spacing; `e2e-operator-browser.mjs` uses enabled ordinary read receipts and verifies three-card postponement, failed/successful Done, reloads and live updates. The same fixtures run in Chromium and WebKit, using temporary stores rather than personal conversations.

Startup waits for the local passcode state before mounting data views; the unlock screen cannot briefly reveal cached content. Unlocking returns to the preserved section. Narrow conversation panes place header actions on a second row and truncate long titles/status lines. Store shutdown drains active snapshot writes and cancels deferred ones before releasing its writer lock, so moving the application folder cannot race a background worker. Certificate reuse uses the same signature, key-match, validity and exact loopback-name checks across Node, Bun and Deno.

Message selection fills the complete row and its outer gutters with one tint. Each row paints only its own preceding gap, including compact sender runs; adjacent selections do not stack translucent backgrounds into darker seams. Checks occupy a permanently reserved gutter outside the message column. Entering or clearing selection does not change bubble widths or horizontal positions, and the selection toolbar retains the normal header space in narrow panes. These rules apply to both Chat and embedded Operator cards.

A context menu temporarily highlights its target row without changing persistent multi-selection; dismissal clears the highlight and **Select** remains an explicit menu action. Mention navigation can use a complete local set immediately. Otherwise it loads the provider's marks and surrounding history. A target is acknowledged only after the jump confirms it was displayed; failed jumps and interrupted navigation retain the entry. Repeated jumps restart the brief highlight, and an already visible message stays in place. Timestamp spacers reserve the same gap and icon width as the visible footer, using an inert placeholder rather than a second animated delivery icon.

Chat and Operator measure the floating composer to reserve only the space it covers. The last message sits one normal message gap above it, including with a reply bar, resized panes and interface scaling. Composer changes follow the tail only when the reader was already there. An opening unread divider stays anchored during partial reads and disappears once the initial unread messages are confirmed read, including updates from another device. Later incoming messages in the same open chat do not revive it; reopening captures a fresh boundary. Removing the divider preserves the reader's visible row. `e2e-chat-layout-browser.mjs` checks these rules with an isolated store and verifies that Operator still acknowledges messages only through Done.

Chat automation actions show preparation and prevent duplicate clicks. A successful safe test reveals its draft above the composer; re-testing an existing draft reopens the same preview without planning the archive again. Closing hides the preview without sending, skipping, or deleting it. Unsent text edits survive refreshes and close/reopen within the view. Escape and outside clicks dismiss the automation menu. A late result belongs to its original conversation, and failures never masquerade as a successful zero-message send. Draft actions require confirmed outcomes: refusals retain the preview and its unsent edits, uncertain delivery remains distinct, and interrupted server actions cannot settle only a browser copy. Targeted planning reads lightweight summaries, never copies cold provider payloads, and preserves owner inference from other conversations. The isolated `e2e-automation-chat-browser.mjs` fixture checks progress, dismissal, reuse, edit preservation, result visibility, errors and navigation races; `automation-planning.test.js` verifies payload isolation and the no-scan reuse path.

Accent text and filled surfaces use separate tokens. Selection actions, unread badges, active tabs, calendar choices, bot buttons, poll choices, file icons and call controls use a fill that supports white labels. The default dark appearance uses neutral surfaces. Imported chat/cloud themes keep their accent color for text and derive a darker fill when necessary to provide at least 4.5:1 label contrast. Mini Apps receive the same button fill in their theme parameters. Browser checks measure rendered control colors across light/dark appearances and bright imported themes, sample selection pixels across gutters and row boundaries, and compare bubble geometry before/during/after selection at wide, narrow and phone widths.
