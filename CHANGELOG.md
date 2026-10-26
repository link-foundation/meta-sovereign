# Changelog (languages: en • [zh](CHANGELOG.zh.md) • [hi](CHANGELOG.hi.md) • [ru](CHANGELOG.ru.md))

## 0.53.0

### Minor Changes

- Keep late and duplicate WebRTC signaling answers from renegotiating an established connection, consume negotiation failures and report unexpected failures through client diagnostics. When macOS temporarily denies access to a device-protected TLS key, wait for the Mac to be unlocked instead of misreporting a copied key or replacing the trusted identity.

  Add initial Work accounts support for Upwork, Fiverr, PeoplePerHour and Wellfound (issue #42): open a visible manual sign-in browser, reuse its app-owned profile, capture a selected profile into whitelisted local fields and show it in Connections and Profile. Preserve snapshots across server restarts, reject login/challenge pages and foreign-origin actions, and keep credentials and cookies out of profile metadata. Update all four user guides and exercise all four services with browser fixtures.

## 0.52.0

### Minor Changes

- 9e18b3d: Make Operator a live queue of unread conversation cards with embedded history and reply composer, without the chat list. Next preserves unread state; Done acknowledges the shown boundary, retains failures for retry and advances after success. Keep keyboard shortcuts out of text fields. Add accessible monochrome unread badges to Chat, Calls and Operator across navigation layouts, reusing the current chat feed and acknowledging reviewed missed-call notifications locally.

## 0.51.2

### Patch Changes

- ee95fe1: Retry failed initial server discovery from GitHub Pages as well as the optional localhost app. Check immediately when a tab regains focus, becomes visible or the network returns, coalesce concurrent searches and stop listeners after recovery. Keep passcode requests off the static website when no server has been discovered, and show accurate connection and automatic retry notices in all four languages.

## 0.51.1

### Patch Changes

- 0389dbe: Rename the global folder tab to All, place it last by default, and add Settings → Folder tabs → Always show “All” first. Reveal the selected tab on startup, folder updates and column resizing while preserving named folders’ Telegram order and the selected folder.

## 0.51.0

### Minor Changes

- f2def61: Prioritise the open conversation, share in-flight history reads and display loading, partial-history and retry status. Keep chat-type filters inside every folder, add saved column widths, move Calls into the main menu and Telegram account editing into Profile, and use neutral dark controls with white line icons. Store application data in the OS user's application folder, migrate legacy stores without replacing their certificate or saved history, and distinguish Telegram waits and transient avatar retries from unexpected failures in diagnostics.

## 0.50.0

### Minor Changes

- Import macOS Contacts, including synced iCloud accounts, or a vCard export into the local contact directory. Preview changes before saving, preserve source identities across repeated imports, and search email addresses and phone numbers. Add the same import flow to the CLI, paginate large directories, count contacts without messages, and keep system access behind an explicit click and OS permission.

  Keep the Contacts directory current while Telegram and other sources sync. Batch live changes, refresh after reconnect or focus, keep a polling fallback, and provide a manual refresh without losing the current search.

  Use GitHub Pages as the default web app and keep the local server as its backend. The localhost UI is disabled unless `--local-ui=true` or `MS_LOCAL_UI=on` is set; desktop shells explicitly enable their bundled UI. Update all four languages' guides and connection notices. Cached Telegram chats stop requesting history when no user account is connected and show how to connect instead of an endless spinner.

  Interactive macOS startup now detects certificate trust, requests it only when needed, protects the per-installation TLS key at rest with a device-only Secure Enclave wrapping key, and opens the hosted app. Both JS and Rust restrict default browser access to the official GitHub Pages origin and the exact local origin, including socket upgrades; unrelated discovery responses are rejected.

## 0.49.18

### Patch Changes

- The README, user guide and a rewritten roadmap say who meta-sovereign is for — a person or an organisation represented online, for personal use, sales, marketing and user support — and map each scenario's critical paths to their status and the next steps (R-Z25). A VK community's own reply (Bots Long Poll `message_reply`) is shown as ours and named after the community; the VK matrix and every language's overview counts are brought up to date.

  The passcode file, saved mail attachments and log rotation retry a rename that Windows refuses for a moment (antivirus, the search indexer), as the store already did; a log that stays held keeps being written instead of failing (R-Z19).

## 0.49.17

### Patch Changes

- The Connections import box streams any export file to the local server (`POST /api/archive/upload`): a Facebook, X or LinkedIn zip is read by its own importer instead of the WhatsApp one, and a WhatsApp export is no longer capped at 64 MB (R-Z23).

  A web-UI send that fails while or after pressing Send is reported as "may have been sent" (`send-unknown`) and is never retried by the composer, so a message can no longer go out twice; the composer says so in every language.

  Stopping the server waits for an inbox pull in flight (VK, GitHub, email, job boards) to store what it fetched, as it already did for a backup.

  A composer send the network accepted is no longer reported as failed when the local store cannot save its copy (a full disk), so it is never sent twice (R-Z24).

  A large export or Telegram file uploaded to the local server (over Wi-Fi from another device, for example) may take up to 3 hours to arrive instead of failing after Node's default 5 minutes.

  Stopping the server also waits for a VK live-update batch in flight to be stored, so it can no longer write after the final flush; a restarted VK live loop never runs next to the old one.

  The import boxes for X, LinkedIn, VK, email (Google Takeout) and Telegram accept the export .zip as it is; the local server reads it in place (R-Z23).

## 0.49.16

### Patch Changes

- Stopping the server waits for a backup in flight to finish and prune, so the archives kept match the setting (flaky on slow runners).

  Contact notes, Share my contact link and QR code, contact and phone links, contact photos, suggested birthday, synced contacts and Block user in Replies; a change with no answer is reported as unknown (R-Y217).

  Secret-chat protocol groundwork (TL layer 73, AES-IGE packets, key exchange, sequence numbers), tested and not exposed in the page or routes (R-Y219).

  Login email change, Forgot password and reset request, passkey list and delete, add passkey through the browser's WebAuthn, and the sign-in code warning before a message is sent (R-Y218).

## 0.49.15

### Patch Changes

- Channel public link, appearance, delete for everyone and the inactive-channels list for the channel limit (R-Y216).

  Custom emoji in the composer, the group's emoji pack and emoji groups in the emoji panel (R-Y214).

  Local storage management, reaction notification settings, reset of all notifications and Telegram's auto-download preset (R-Y215).

  Chat translate bar over foreign-language chats and a summary of long messages (R-Y213).

## 0.49.14

### Patch Changes

- 1faf84f: Linux WebKit fixes (R-Z22): reduced visual effects switch transitions off instead of leaving a 0.01ms fade (which gave low-contrast text while the theme switched); the tutorial card never covers the control it points at (the target is scrolled into the space the card leaves free, and the card collapses when it cannot be), including with taller fonts; the card takes focus on every step even when the page grabs it back. Stored data is unchanged.

## 0.49.13

### Patch Changes

- 73a4c71: The page stays usable when the browser renders slowly (software-rendered WebKit on Linux): a bounded frame-time probe and Settings → Appearance → "Reduce visual effects" (auto/on/off, `?effects=reduced`) set `html[data-effects="reduced"]`, which drops backdrop blur, the tutorial's page-sized dim and non-essential animations; the Linux WebKit e2e step runs with it forced to show whether slow compositing was the cause (R-Z21).

## 0.49.12

### Patch Changes

- b075716: Documentation links are valid in all four languages: bare URLs next to CJK and Devanagari punctuation are wrapped, dead links replaced, bot-blocking hosts listed in `.lycheeignore`, and stale GitHub known gaps updated (R-Z18).

## 0.49.11

### Patch Changes

- 8121032: VK voice, audio and video play inline from exact VK CDN hosts (`media-src`), a VK video page is a link-out card, VK captcha dialog on user actions (background pulls mark the connection as needing attention), VK chat scroll-back, GitHub unread notifications with a user-clicked "Mark read" (send-unknown on an ambiguous failure), and mail pulled by the shared pull runner instead of its own timer (R-Z20).

## 0.49.10

### Patch Changes

- 32152fb: Imported archive media and reactions are visible in the page: a safe `/api/media/<network>/<sha256>` route, picture/player/file-chip/"media not imported" display, reaction actors on hover, and WhatsApp zip media imported through the streaming reader (R-Z15).

## 0.49.9

### Patch Changes

- 7b7781e: Store file renames (compaction, durable writes, export and cache files) now retry on Windows when antivirus or the indexer holds the file open (EPERM/EBUSY/EACCES, about a second in all). A compaction that still cannot rename leaves the old log intact, is reported, and is tried again 30 seconds later (R-Z19).

## 0.49.8

### Patch Changes

- 3c37a49: Consistent states, errors, dialogs and locales across pages; WebKit e2e green and in CI (R-Z12).

## 0.49.7

### Patch Changes

- c0eda9c: Streaming .msbk backups, schema-aware restore and daily scheduled backups by default (R-Z16).

## 0.49.6

### Patch Changes

- 9967f60: Wired the audience-sync and cache-purge jobs, an opt-in backup schedule, one tombstone shape with migration 0006, and Upwork/PeoplePerHour cache docs (R-Z7).

## 0.49.5

### Patch Changes

- 1fc295c: Archive imports for Facebook, Instagram, X and LinkedIn: collision-free ids with a migration, repaired text, attachments, reactions, X group DMs, streaming ZIP (R-Z10).

## 0.49.4

### Patch Changes

- badd23b: GitHub is a full inbox: review comments, notifications, Discussions, incremental pulls, a repository picker, and correct edit, delete and react, with its schedule on the shared pull runner (R-Z11).

## 0.49.3

### Patch Changes

- e2f95c0: Inbox pulls that run for VK, Upwork and PeoplePerHour, VK live updates, names, media, reactions and safe sends (R-Z8).

## 0.49.2

### Patch Changes

- The CLI answers `--version` (`-v`, `version`) with the package version, and `--help` (`-h`) prints the help and succeeds.

  The npm package ships only the CLI, library and web app (`js/bin`, `js/src`): 3 MB instead of 17.8 MB, without tests, experiments, docs or the Rust, desktop and mobile sources.

  Personal WhatsApp: visible Web sign-in, stable chat ids with a data migration, Android and iOS export import, confirmed-only browser sends and a terms notice (R-Z9).

## 0.49.1

### Patch Changes

- 272340c: The stored data has a schema version and is migrated safely and automatically, with rollback after a failure or crash (R-Z17).

## 0.49.0

### Minor Changes

- Change phone number, away period, delete account link and Export Telegram data through a takeout session (R-Y212).

  Switch the whole app to another Telegram account: each extra account runs on its own store, with a per-account browser copy, an active-account chip, other accounts' unread and notifications (R-Y202).

  Delete all from user with ban and spam report, Not spam in Recent actions, convert to broadcast group, transfer ownership, channels you left; Escape closes only the top dialog (R-Y200).

  A group's permissions and slow mode can be changed by admins who may ban users, and supergroups and channels show their recent actions (R-Y133).

  Add members, administrators and their rights, chat history for new members, and upgrading a basic group to a supergroup (R-Y204).

  Animated stickers play (R-Y113), as Telegram's apps: a `.tgs` sticker in a chat or in the sticker panel shows its picture, then its Lottie animation drawn as SVG by lottie-web's light player (bundled; no eval, no workers, so the content policy stands), looping while on screen and still when off it or when less motion is asked for. The panel's `sticker?full=1` now also serves an animated sticker's animation.

  Mini apps in search, similar bots, prepared messages, collectible usernames (R-Y194).

  Archive and read-mark settings, logged-in websites with Disconnect, pinned Saved Messages chats, hiding stories from the strip (R-Y174).

  A chat's auto-delete timer, and Saved Messages viewed as chats (R-Y143).

  Autopilot: a confirmed automation writes to every chat it fits by itself at its pacing and daily cap; with the monitor on, each chat opens as it is reached, and the monitor can be turned off while it keeps going; a line above the chat shows progress and Stop (R-Y87).

  An incoming message reads only the automations, kept until one changes, instead of copying the whole store each time — which ran a large store's server out of memory during a sync (R-Y81).

  After an automation's draft is sent, the chat offers the next chat it fits, with the user's edited text carried over (names become `{name}`/`{first}`); the draft can go back to the automation's own text (R-Y86).

  Every automated send goes out at most once, paced, outside quiet hours, and never to opted-out or dead chats (R-Z3).

  The autopilot starts and stops from the Automations page and the chat header's Automations menu; started with the monitor on, it opens each chat as it writes to it (R-Y91).

  The history download passes over a chat Telegram cannot address instead of retrying it forever while every other chat waits (R-Y80).

  Block and unblock, add and delete contacts, report spam and report through Telegram's own reasons, from a chat's info column (R-Y128).

  Channel boosts: level, progress, link, Boost with slot reassignment asked first, boosters list; Saved Messages tags refresh after a reaction (R-Y173).

  A bot's buttons (R-Y110), as Telegram Desktop: rows of buttons under a bot's message — a press asks the bot (new `bot-callback` route, messages.getBotCallbackAnswer) and shows its answer as a toast, a box or a link to open; link buttons ask before opening (web links only); copy, profile and switch-inline buttons work; ones only Telegram's apps can do say so. The keyboard a bot puts under the message box shows there with its placeholder; its buttons send their words; a button beside the box hides and shows it; a bot asking for an answer makes the box reply to it.

  Typing "/" in a chat with bots lists their commands, and a bot chat has a Menu button (R-Y135).

  HTML5 bot games: game cards, Play, high scores (R-Y190).

  Bot login buttons and links with the login dialog, attachment-menu bots (R-Y201).

  Telegram Business hours, location, intro, chat links, chatbots, and folder tags (R-Y180).

  A recent calls list with All and Missed tabs, and call messages in chats that read as in Telegram Desktop (R-Y163).

  A channel post's comments and a group message's thread: "N comments" / "Leave a comment" at the post's foot opens a panel with the post, the comments with older ones on demand, and a composer that comments or answers a comment (R-Y126).

  Channel direct messages and suggested posts (R-Y191).

  Albums are one bubble with a grid and one caption, and a photo with no caption keeps its size instead of showing only its time (R-Y89); a forward names the channel it came from instead of "PeerChannel" (R-Y90).

  Days in a chat and a jump to a date (R-Y106), as Telegram's apps: each day's messages under its date, the top one floating while scrolling; a click opens a calendar, and a picked day opens the chat at its first message — far back too, reading only the page around it, then the pages after it as the user scrolls down; the "down" button goes back to the newest. Older pages now ask Telegram whenever the store holds a hole below, so a search or a jump never shows a gap.

  The chat list stays whole while the server is busy or restarting, so "Oldest first" starts with the oldest chats (R-Y88).

  Admins choose which reactions a group or channel allows, and the reaction picker follows it (R-Y160).

  Group and channel settings for admins (signatures, discussion group, join to send, approve members, hide members, anti-spam, restrict saving), and the app honours restricted saving (R-Y165).

  Statistics of channels and big supergroups: overview, graphs with zoom and tooltips, recent posts or top members (R-Y167).

  Chat themes in private chats and managing several usernames for the user and owned channels (R-Y170).

  Chat backgrounds: Telegram's wallpapers, a picture from a file, or none, drawn behind the messages; a wallpaper for one chat (R-Y155).

  Checklists, reaction reports, post statistics and Stars revenue (R-Y195).

  CI is green on Node, Bun and Deno across platforms, with non-gating Rust and browser e2e jobs (R-Z6).

  A chat whose history was cleared stays in the chat list, empty, as Telegram Desktop keeps it (R-Y118); only Delete chat and Leave remove it. The jump-to-date calendar stops at the chat's first message once it is loaded (R-Y119).

  An installed link-cli without --serve or binary archives is not used (R-Y94).

  Cloud themes with previews, apply and addtheme links, and the per-chat Do not translate switch (R-Y209).

  Groups in common in a person's info, listed and opened in the app (R-Y158).

  Community chats that GramJS cannot place are dropped from Telegram's answers, and the repair logs why reads failed (R-Y222).

  The Contacts window and read times in private chats (R-Y189).

  Custom emoji in Telegram messages are drawn as their pictures: still, animated (Lottie) or video, big when alone, copied as the fallback emoji (R-Y120).

  The CV runner's page loads no longer wait browser-commander 0.32's extra URL-stability polls (about 6 s per page), so the CV e2e runs in its time again.

  Tests: the Deno run no longer fails on a store that was never written (the snapshot worker finds no log and has nothing to save) or on GramJS's part-size check, which is now tested without importing GramJS.

  Dice as in Telegram's apps: a lone 🎲 🎯 🏀 ⚽ 🎳 🎰 is sent as a die, and dice are drawn as Telegram's own animations rolling to their value (R-Y130).

  Cloud drafts sync and Clear all drafts, day counts in the jump-to-date calendar, and frequent contacts in search (R-Y207).

  A real-browser test for an automation's draft and the next chat (R-Y95).

  Editing a message happens in the composer, as in Telegram Desktop, with the earlier draft kept; also an order-independent custom emoji test (R-Y146).

  Email is sent safely, parsed and threaded correctly, uses verified TLS or STARTTLS, pulls incrementally and has a Fetch mail now button (R-Z5).

  Emoji found by words in the page's language (R-Y117), as Telegram's apps: the emoji panel's search uses Telegram's own emoji keywords (messages.getEmojiKeywords, kept a day per language) before English names. New route `POST /api/telegram/emoji-keywords {lang}`. Lint, format and duplication checks now skip `.claude/` (Claude Code's worktrees).

  Emoji skin tones (R-Y114), as Telegram Desktop: an emoji that takes a tone carries a corner mark; a right click or a held press opens its six variants, and the tone picked is remembered for it (in this browser), in the panel and in search.

  Emoji statuses show next to people's names, and Premium users set or remove their own with a duration (R-Y162).

  Bots' ephemeral messages are shown inline in chats, with buttons that answer on click (R-Y223).

  The live event stream cuts off a page that stops reading it once 4 MB wait for it, instead of holding every change until the server runs out of memory; the schema script also reads TDLib's TL text (layer 232 tried and kept off: it adds communities GramJS cannot place) (R-Y78).

  Export chat history to HTML and JSON (R-Y186).

  Per-network feature matrices in four languages, translated requirements sections R, S and T, and honest README, guide and roadmap text (R-Z13).

  A feature support matrix (docs/FEATURES.md, four languages): what is supported, partial, parked or not supported, and whether it is reachable through the API or the web app.

  A file in a message sits at the bubble's left edge with no tile behind it, as in Telegram, instead of centred like a button (R-Y79).

  Chat folders can be created, edited, deleted and reordered, and Telegram's recommended folders added (R-Y164).

  Long form dialogs (My profile) scroll inside the card with Save always in reach on a small window (R-Y129).

  A formatting bar and a way back from a reply (R-Y109), as Telegram Desktop: text selected in the message box shows bold, italic, underline, strikethrough, monospace, spoiler, link and plain-text buttons; Ctrl/⌘+U underlines, and underline is sent to Telegram as its own formatting. After a reply's quote is followed, "down" goes back to the reply, then to the newest; the open chat clicked again goes to its newest. A message jumped to while older pages load above it now ends in view.

  Forum groups show their topics as Telegram's tabs layout: All and each topic with its mark, unread count and lock; a topic shows its own messages, is read on its own, and sends go to it; topic service lines are named (R-Y122).

  Forwards from channels not among the chats are read again once and named; when Telegram asks to wait, the repair waits and asks again instead of giving up (R-Y92).

  Forwards from channels not among the chats are read again once and named (R-Y92).

  Forwarding options (hide sender's name or captions, choose another chat), Copy link on messages, and opening t.me message links in the app (R-Y154).

  A full disk no longer crashes the server or loses track of messages; low-disk banner and guards (R-Z14).

  Managing received gifts, unique gifts and gift codes (R-Y193).

  Giveaways, paid messages and channel auto-translation (R-Y184).

  Search across Telegram and a jump to any message (R-Y107), as Telegram's apps: the chat list's box shows "Global search" (people and chats found by name or username, not in the list) and "Messages" found in every chat, a page at a time, the words found marked; a click opens the chat at that message. Every jump to a message — a reply's quote, the pinned message, an unread mention, a match in a chat — now opens the chat around it at once, far back too, reading only the page around it. The chat list moved to its own module (`chat-sidebar.js`).

  Group sticker set and emoji pack, pinned topic reorder, new chats in shared folders and the new-contacts notification (R-Y211).

  A group's members in its info column, searchable, with Remove for admins who may ban, asked in the page first (R-Y125).

  Hashtag search, live view counters and picture-in-picture (R-Y182).

  Inline bots in the composer: "@gif cats" shows the bot's answers to pick and send (R-Y138).

  Instant View: an in-app reader for link previews Telegram has as Instant View pages (R-Y205).

  Invite links (create, edit, revoke, who joined) and member requests (approve, dismiss, the bar in the chat) (R-Y152).

  Effects on file sends, a live join-requests bar, and topic links that open the topic (R-Y161).

  The composer previews a link while typing; the preview can be removed, moved above the text, or made larger or smaller (R-Y145).

  Loading looks like Telegram's everywhere: a turning arc on pages still loading, shimmering rows in the chat list, and the arc beside every "working" line and inside working buttons (R-Y84).

  Places in chats show Telegram's own map picture with a pin, the venue's title and address, and open on OpenStreetMap (R-Y131).

  R-Y72: photos, avatars, videos, voice messages and files show in the hosted app (GitHub Pages) again. The page asks for them as CORS requests, so the browser says which page asks, and the server lets the app's own origins have them while other sites still get none (before, every such load said only "cross-site" and was refused). A picture that does not load shows its blurred preview instead of a broken-image icon, Save As fetches the file before saving it, and failed or refused loads are counted in the log by route.

  Message effects in private chats: a badge and a burst on received ones, and Send with effect in the Send button's menu (R-Y149).

  Multiple Telegram accounts, first part: Accounts window, add account, read-only chat list and unread count of extra accounts, log out (R-Y198).

  New groups and channels from the chat list's "+", and a chat's name, description and photo edited from its info column (R-Y129).

  R-Y75: no manual sync in the UI, as in Telegram's own apps. "Sync now" is gone from the chat list's footer and the empty Chat, and "Refresh" from Backups. The account syncs and retries by itself; the footer says "Connecting…" while the connection is down, "Updating…" during a sync, and why a sync failed. Requests made while Telegram reconnects wait for it instead of failing, and the Backups list reloads itself.

  Notifications of new messages in chats that are not muted, a click opening the chat, and the unread count in the page title, with choices in Settings (R-Y134).

  Notifications of new messages and the title's unread count now work in every section of the app, not only in Chat (R-Y144).

  Telegram's notification settings: by kind of chat with exceptions in Settings, and each chat's own (mute, preview, reset); the app's notifications follow them (R-Y157).

  A bar over a chat with a stranger offers Add to contacts, Share my phone number, Block user and Report spam as Telegram offers them, and hides for good (R-Y137).

  A photo editor in the send box: crop, rotate, flip and draw (R-Y187).

  The pinned messages list with Unpin all, similar channels in a channel's info, and fact checks under messages (R-Y166).

  Pinned chats can be reordered by dragging or with Move up / Move down in their menu (R-Y159).

  A poll or quiz is created and sent from the chat's paperclip menu, as in Telegram's apps (R-Y121).

  Privacy and security of the Telegram account: who can see what, active sessions with Terminate, and blocked users (R-Y139).

  Private one-to-one calls: Call button, incoming call notification, key exchange with Telegram's key emoji, rating; no audio yet (R-Y196).

  Birthdays, name and profile colours, and a personal channel on profiles (R-Y178).

  Stories, music and Send a gift on profiles (R-Y185).

  Edit your own Telegram profile: photo, name, bio, username with an availability check (R-Y136).

  Sign in to Telegram by QR code, with the app's own QR encoder (R-Y203).

  Telegram Business quick replies, greeting and away messages (R-Y179).

  Who read a message ("Seen by…") and who reacted to it, from the message menu, in panels as Telegram Desktop's (R-Y127).

  The repair of unsupported messages passes over a chat Telegram cannot address, so it no longer runs again on every start (R-Y82).

  R-Y70: reply suggestions while typing come from the browser's own copy of the reply index, kept on the associative stack. The server gives the index as links (`reply-link`, `sent-link`, `word-link`, `spelling-link`, `chat-link`, `last-link`) at `/api/suggest/model` — compressed JSON or Links Notation (`?format=lino`), pruned to what a browser needs — and, to a copy holding a version, only the messages it learned since (`?since=`). The browser keeps the copy in its links storage (IndexedDB, or doublets-web when present), suggests from it at once (also after a reload and offline), catches up when the live stream says something arrived, and adds the server's rarer suggestions once typing pauses.

  R-Y71: typing, scrolling and opening chats stay smooth with thousands of chats. A keystroke re-renders only the message box and its suggestions (no long tasks while typing, down from ~260 ms per key), the chat list renders a page of rows and grows as it is scrolled, rows re-render only when their chat changes, and rows out of sight are not laid out (list scroll frames ≤ 18 ms with 3000 chats, down from 119 ms).

  Bot request-peer buttons with a filtered picker, and recent places in the Location dialog (R-Y208).

  Files, video and audio in rich messages and Instant View pages can be downloaded and played (R-Y224).

  Rich messages and Telegram's current schema, layer 232 (R-Y220).

  Rich messages and Instant View pages draw mentions, hashtags, auto links, custom emoji, text buttons and KaTeX math (R-Y225).

  Round video messages: received ones play as circles, and the composer records and sends them from the camera (R-Y150).

  R-Y73: the message menu opens on a right-click anywhere on the message's row, beside the bubble too, as in Telegram Desktop. In Safari, which selects the word under a right-click before the page sees it, that word is let go and the message's own menu opens (Reply, Copy, Copy Link, Forward, Delete, Select) instead of the text-selection one. The selection end-to-end test runs in WebKit (`E2E_BROWSER=webkit`) as well as Chromium.

  Save and remove GIFs from a message's menu; view a forum as messages or as topics (R-Y171).

  The default auto-delete timer in Privacy and security, and Saved Messages reaction tags to filter by and rename (R-Y151).

  Interface scale, message text size and the connection proxy (R-Y192).

  Two-step verification, account self-destruct, sensitive content and per-session settings (R-Y177).

  Messages are picked with the mouse as in Telegram: a click on a message's time selects it, a short drag beside a bubble selects its message, and while selecting, clicks between rows or beside the column count (R-Y83).

  "Send as" in supergroups: pick the identity messages are sent with (R-Y141).

  Send as on inline and shared-place sends, live locations that keep moving, the bot start parameter, and the paperclip menu back over the paperclip (R-Y147).

  An automation's draft reaches an old chat (every dialog is listed once and each chat's address stored); Send shows it is working and a failure says why in words; photos no longer hold up the About panel or a send; the About panel opens the chat in Telegram (R-Y85).

  Send when online, Saved Messages reminders, reordering pinned saved chats, live location viewer (R-Y197).

  Sends and syncs across networks no longer claim success they did not have, and LinkedIn chat messages never become public posts (R-Z4).

  Harden the local server: foreign Host refused, body limits and strict JSON, secrets masked, uniform errors, fast port failure, outbound timeouts, safe patterns (R-Z1).

  Show every service message kind, bank card, date and diff entities, live stream cards and link preview kinds (R-Y221).

  Share a place (or a live location) and a contact from the attach menu (R-Y142).

  Folders follow other devices live, can be dragged to reorder, and can be shared, joined and left by invite link (R-Y172).

  A chat's profile column and its shared media (R-Y111), as Telegram Desktop: the header's button opens a column for any Telegram chat with its photo, name, status, @username and about text, then how many photos, videos, files, music, links, voice messages and GIFs it has (new `shared-counts` route, messages.getSearchCounters); each opens its list a page at a time (new `shared-media` route, messages.search with the kind's filter) — pictures as a grid, the rest as rows — and a click goes to the message in the chat.

  The data.bin snapshot of a large store fits in memory; a failing one is reported once per try and retried with a doubling wait (R-Y93).

  Notification sounds and auto-download settings (R-Y181); a local passcode lock and keyboard shortcuts (R-Y183).

  Telegram Stars: balance and history, gifts on profiles, paid reactions and paid media with confirmation (R-Y176).

  A sticker in a chat opens its set's box with Add or Remove, a sticker there sent to the chat; installed sets can be removed from the emoji panel (R-Y124).

  Trending stickers and emoji, clear recent stickers, the quick reaction, stickers in a photo, emoji suggestions by keyword and custom emoji search (R-Y206).

  Searching stickers and GIFs (R-Y112), as Telegram Desktop: a search box over the Stickers tab finds stickers for an emoji (messages.getStickers) or by words (messages.searchStickers) and sticker sets by name (messages.searchStickerSets); one over the GIFs tab finds GIFs through Telegram's @gif bot (messages.getInlineBotResults), more as the list scrolls. New `sticker-search` and `gif-search` routes; what is found is sent as any sticker or GIF.

  A sticker's and a GIF's menu in the panel (R-Y115), as Telegram Desktop: send without sound, schedule, add to or remove from favourites, remove from recent, save or delete a GIF. New route `POST /api/telegram/sticker-save {id, action}`; the panel stays open under its menus and dialogs.

  A sticker set found by a search can be added (R-Y116), as Telegram Desktop: an Add button by its title installs it (messages.installStickerSet). New route `POST /api/telegram/sticker-set-install {id, install}`.

  A sticker set's picture in the panel's bar for animated and video sets (whose own picture is Lottie or a video): its first sticker's picture instead (R-Y105).

  Sticker and emoji set settings, close friends, adding a contact by phone (R-Y169); a unit test no longer depends on today's date.

  Durable writes, one writer per store, quarantined corruption, private files, secret-free plain backups and redacted rotating logs (R-Z2).

  The store no longer runs out of memory on a large log: ids and names read from `data.lino` are copied out of their lines (a slice kept each whole line alive, 6.5 GB for a 2.7 GB log), the snapshot worker gets the parent's heap limit, and the log is compacted when superseded text outweighs the live text, not only when superseded lines outnumber the live links — one sync record written 150,000 times had grown it by a gigabyte.

  Stories: a strip above the chat list and a full-screen viewer that marks them read (R-Y140).

  Story rings in the chat list open the viewer; replies, reactions, own-story viewers, delete and hiding stories (R-Y148).

  Story stealth mode, viewers' reactions tab and search, story reports, view count refresh (R-Y199).

  Manage one's own stories from the viewer: edit caption (formatting kept) and privacy, copy link, save to or remove from profile, delete (R-Y210).

  Posting a story: photo or video, caption, who can see it, screenshots, keep on profile and period (R-Y156).

  Telegram's chat folders as tabs above the chat list, as Telegram Desktop and Telegram for macOS show them: "All chats" and the folders in Telegram's order, each with its unread chats; a folder lists the chats its rules take, its own pinned ones first (R-Y103).

  The chat list has Telegram's menu: pin, mute for a time or for good, mark as read or unread, archive (R-Y97).

  Search in a chat, as in Telegram's apps: Ctrl/Cmd+F or the magnifier, Telegram asked, Enter and Shift+Enter between matches (R-Y98).

  R-Y68: messages, their menu and the chat list behave as in Telegram Desktop. The menu has Desktop's items in its order: Reply (Quote & Reply when part of the text is selected, sent as Telegram's quote), Copy Selected Text, Edit, Pin/Unpin, Save As… and Copy Image on a photo, Copy Text, Copy Link on a link or Copy Message Link / Copy Post Link, Forward, Delete, Select. A selected message's menu copies, forwards, deletes or unpins the selection or clears it, and another message's offers "Select up to this message". Dragging from message to message selects (or unselects) the range and scrolls at the list's edges; selected rows are tinted across the width with Desktop's green check; the top bar shows Forward n, Delete n and Cancel; several messages copy as `[date time] Name: text`. Incoming messages in groups have the corner Reply. The chat list puts pinned chats first in their order, shows muted counts in grey, keeps archived chats behind one row and says who wrote last and what. A read on another device keeps the count Telegram says is still unread, and photos and stickers in messages download at their right size.

  The emoji panel by the message box, as Telegram Desktop's: frequently used first, the categories with a bar to jump between them, a search by name; a pick goes in at the caret and the panel stays open (R-Y104).

  R-Y76: GramJS now speaks Telegram's current API layer (225) instead of the 198 it ships, so polls (new constructor), checklists and newer media arrive as they are instead of "unsupported". The schema Telegram publishes is converted by `js/scripts/telegram-schema.mjs` and given to GramJS before it loads. Messages stored as unsupported are read again once in the background. Editing a message in a channel works (it used a method Telegram does not have). The pinned bar names unsupported messages, games and invoices instead of staying empty.

  No sync line under the chat list and no sync errors in Chat: failures retry by themselves until they work; Telegram out of reach for a minute turns the header badge to Offline (R-Y96).

  Polls, quizzes and checklists as in Telegram's apps: vote, shares and bars, quiz answers with the explanation, recent voters, countdown, View results, Retract vote, Stop poll, results refreshed while on screen, checklists ticked through Telegram (R-Y74). A Telegram request made while another is in flight runs as part of it instead of deadlocking the queue; undecodable answers are logged by constructor id (R-Y77).

  Clear history, delete a chat, leave a group or channel from the chat list's menu, after Telegram's question, as in its apps (R-Y100).

  Send files and photos, as in Telegram's apps: the paperclip, a paste or a drop opens a send box with previews, a caption, "Compress images" and "Group items" (albums); uploads show their progress (R-Y99).

  The Send button's menu as in Telegram Desktop: "Send without sound" and "Schedule message" for messages and files; a chat's scheduled messages by the message box, each sent now, rescheduled or deleted (R-Y102).

  Stickers and GIFs in the emoji panel, as in Telegram Desktop: Emoji, Stickers and GIFs tabs; the favourite and recent stickers and every sticker set (each loaded as the list reaches it, with a bar to jump between sets); the saved GIFs; a click sends at once, as a reply when one is being written (R-Y105).

  Text formatting as in Telegram Desktop: bold, italic, strike, spoiler, code, code blocks and links typed with its markdown go as Telegram's formatting, in messages, edits and captions; Ctrl/Cmd+B, I, Shift+X, Shift+M, Shift+P, K and Shift+N format the selection (R-Y101).

  Forum topics can be created, edited, closed, pinned, hidden and deleted, and topics turned on or off (R-Y153).

  Transcribing voice and round video messages; reporting single messages and selections (R-Y175).

  Translate a message from its menu: the original and Telegram's translation in a box, with a choice of language and Copy translation (R-Y132).

  R-Y69: reply suggestions stay away until they help. With nothing typed only a typical reply to the chat's last message is offered (given at least twice and at least a fifth of your answers to it), a message older than the reply window gets none, and long suggestions end in an ellipsis in Safari too.

  Voice chats and live streams in groups and channels (R-Y188).

  Voice messages (R-Y108), as Telegram Desktop: with nothing typed, a microphone takes Send's place; held, it records (red dot, time, "Release outside this field to cancel"), let go over the box sends, outside drops; dragged up it locks (Send sends, Cancel or Esc drops); too short a press says to hold it. The recording is remuxed from WebM to Ogg Opus in the page and sent as Telegram's voice note with its length and waveform (new `send-voice` route).

  Bot mini apps: menu, keyboard and link buttons open the bot's web app in a sandboxed window with Telegram's bridge (R-Y168).

## 0.48.0

### Minor Changes

- cef1943: R-Y67: messages are selected and acted on as in Telegram's apps. A right-click (or a long press) opens the message's menu at the pointer with its reactions and Reply, Edit, Copy text or Copy selected text, Copy link, Pin/Unpin, Forward, Select and Delete, in Telegram's order; Esc, a scroll or a click outside closes it. A double-click or a swipe to the left replies, a double tap reacts with 👍. Select starts selection mode: a check on every message, click or Shift+click to choose up to 100, then copy (under each sender's name and time), forward or delete them at once from the bar in the composer's place; Esc, Ctrl/Cmd+C and Delete work as in Telegram Desktop. In an empty composer ↑ edits the last own message and Ctrl/Cmd+↑/↓ choose the reply. Pinning asks Telegram's question ("Pin for me and …", "Pin and notify all members") and goes through the new `POST /api/telegram/pin`. An open chat whose older messages Telegram cannot give yet (not connected, still loading) now asks again every 5 seconds instead of hundreds of times a second.

## 0.47.2

### Patch Changes

- 510bb6b: R-Y65, R-Y66: the app stays online and keeps loading. One slow read no longer takes it offline while the server answers; the open chat asks for its messages again until they come; the local copy reloads itself when its server comes back with a new build, and keeps looking for a server it did not find; a stuck Telegram request reconnects at once. Every avatar shows: group members' photos are read by their message (GramJS failed that lookup, and the failure was remembered as "no photo" for a day), failed downloads are retried, and a photo still downloading no longer holds one of the browser's few connections.

## 0.47.1

### Patch Changes

- 37c5f45: R-Y62: a stuck Telegram request no longer leaves Telegram clients behind. Readers that ask for a connection at the same time now share one, and a dropped client is destroyed: GramJS's `disconnect()` kept its update loop running, which reconnected it, so every stuck request added clients that each handled every update until the server ran out of memory.

## 0.47.0

### Minor Changes

- 805baf2: R-Y64: the server now serves HTTPS on the same port as HTTP, using its own self-signed certificate valid for localhost, 127.0.0.1 and ::1 only (kept in `<store>/tls/`, renewed automatically 30 days before expiry). Run `npx -y meta-sovereign trust` once on macOS to add the certificate to the login keychain (other systems print the certificate path), or open `https://127.0.0.1:<port>/trust` in Safari, click Show Details → visit this website, and enter your password. After trusting, the hosted app at <https://link-foundation.github.io/meta-sovereign/> connects to the local server in Safari directly, without needing the server's own copy. Before trusting, the in-app notice links both **Open the app from the server** and a **Trust the server** page. `--tls=false` / `MS_TLS=off` turns HTTPS off.

## 0.46.2

### Patch Changes

- e970f26: The hosted app no longer jumps to http://127.0.0.1 by itself: in Safari it names the server it found and links its own copy (R-Y60). A Telegram request that is never answered no longer stalls every other one (avatars, chat info, history), so the page's reads no longer pile up until it shows offline (R-Y62). After a failed read the app checks its server every 10 seconds and comes back online by itself (R-Y63). The Safari note shows only on https pages.

## 0.46.1

### Patch Changes

- 1332d65: The package is tested as npm would ship it, without publishing: `npm run test:pack` packs it, runs it with `npx` and checks the server it starts; CI runs it with `npm publish --dry-run` before every release (R-Y61).

## 0.46.0

### Minor Changes

- c7eb154: The chat list sorts by the latest message (the default) or the oldest,
  and remembers the choice (R-Y49). The maintainer's newer directives are
  tracked as requirements, the undelivered ones marked open (R-Y50 …
  R-Y56).

  Chat reads every network store first and by priority (R-Y24 .. R-Y33).
  Every message ever loaded stays in the app folder's store, along with
  everything Telegram said about it (`raw`), so it is never asked for
  again and can be analysed offline. Requests go one at a time: the chat
  on screen comes first, then the chat list, then a prefetch of the chats
  visible in the list, then a slow background download of whole histories
  (private chats, then groups; channels only on demand). Scrolling up
  loads older messages two screens ahead and keeps the reading position.
  The page holds only the chat list and pages of the open chat (the new
  `/api/chat/heads` and `/api/chat/messages` endpoints), and `data.lino`
  is now an append log, so whole histories stay fast. New tabs filter the
  list by All, Private, Groups and Channels. The tutorial no longer comes
  back once a service is connected. Working rules for people and AI agents
  are now in CONTRIBUTING (four languages) and `CLAUDE.md`.

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

  The hosted app on GitHub Pages is the default UI: `serve` prints its address and the app finds the server on port 8787 by itself, and `serve --local-ui=false` (or `MS_LOCAL_UI=off`) stops serving the local copy, sending `/` to the hosted app; `--ui-url` names another hosted copy. A browser test compares the hosted copy with the local one and runs after every Pages deploy (R-O14, R-Y58, R-Y59). Questions are compared by a temporary word grammar until formal-ai can do it (R-Y57).

  A personal chat's header opens what the conversation tells about the
  person, learned from the stored history (R-Y50 … R-Y54): the questions
  asked and their answers, our questions of the same meaning counted
  once; how we address each other — "ты" or "вы", agreed ("на ты?" —
  "давай") or as used, which the automations now follow too; their
  work, position and workplace; and their accounts elsewhere, a GitHub
  account marked confirmed when its public profile links back to them
  (checked once a week). A chat whose history is not stored to its first
  message is read before any other. link-assistant/formal-ai cannot tell
  same-meaning questions apart yet (reported as
  link-assistant/formal-ai#1330); a local check groups them until it can.

  Chat now behaves like Telegram's own apps when the connection is
  unreliable, following the open-source clients pinned in
  `docs/CHAT-REFERENCES.md`: updates missed while offline are fetched with
  `updates.getDifference`, reading a chat marks it read on Telegram (can
  be turned off in Settings → Privacy) with unread counts and an "Unread
  messages" line, drafts are kept across reloads and synced with
  Telegram's cloud drafts, the outbox survives a reload and still sends
  each message once, temporary failures and flood waits are retried by
  themselves, a lasting failure stops the chat's queue with Resend all /
  Delete all, and a banner shows when Chat is not connected.

  "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

  Tutorial advances when a service actually connects, and the "confirmed with
  Telegram" check mark gets a reliable tooltip.

  - The connect step no longer gets stuck: finishing a connection — a saved
    session, a phone login, a bot token or API keys — now advances the tour
    past it, however the user connected. Connect paths dispatch a
    `meta-sovereign:connected` event and the step listens for it
    (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
  - The verified check mark now shows a styled CSS tooltip on hover and
    keyboard focus instead of the native `title`, which was slow to appear and
    easy to miss. An `aria-label` keeps the words available to screen readers.

  Connecting Telegram now makes Chat and Contacts work: the connected user account's chats, recent messages and address-book contacts are synced (on connect, on server start, and every 30 seconds), Chat shows the connected account and "Sync now" instead of asking to connect again, messages typed in Chat are sent through the connected account, Contacts gains search and a "Message" button that opens a chat with the person, and the tutorial shows Contacts and how to open a chat from there.

  Chat now behaves like a real messenger. A message is sent exactly once: Send clears the box at once, a repeated request for the same message never posts it twice (a per-message `clientId` on the server and Telegram's `random_id`), and messages of a chat go out in order. Each of your messages shows its delivery (a clock while sending, ✓ sent, ✓✓ read), and a failed one says why, with Retry and Delete. New messages, edits, deletions, read receipts and typing from the connected Telegram account appear live through a new `GET /api/events` stream, each chat keeps its own draft, and the view offers "New messages ↓" instead of jumping while you read.

  Every action on a message now works on every network the user is
  signed in to: the network's API first and, when it has no such call or
  refuses, the same action in the network's own web app (R-Y38). Edit,
  delete, react, forward and mark read join sending, through
  `POST /api/message/*`; Chat offers them for every network, with a row of
  quick reactions and an edit dialog. A network whose API cannot pull is
  read in its web app: the chat list, then the newest messages.

  The web apps (VK, Telegram, WhatsApp, X, Facebook, LinkedIn, Upwork) are
  described as data in `sources/web-uis.js`, and driven through
  browser-commander in the user's own profile with no automation bar; the
  CV browser now launches through browser-commander too. Saved tokens and
  ids now reach the adapters, so the API is really tried first.

  Messages from every network carry the same fields where the network has
  them — sender and chat names, chat type, reply, forward, attachments,
  reactions, delivery, edited, deleted and the raw message (R-Y39,
  R-Y28) — and Chat shows them the same way.

  Dependencies are updated: browser-commander 0.32.1, Playwright 1.64.1,
  Electron 44.9.0, React 19.3.1, ESLint 10.13.0, links-notation 0.27.1 and
  lino-objects-codec 0.9.2.

  Docs: R-O19, R-Q10, R-R18, R-S22 and R-T22 marked done — their pull requests were merged.

  Safari keeps the hosted app on GitHub Pages from reaching the local server, so the server now serves a small picture (`/api/beacon.svg`) that the hosted page finds on our ports; it then opens the server's own copy of the app by itself, or says that copy is off. The browser test runs the hosted copy in WebKit too (R-Y60).

  Two stores over one folder no longer rename each other's binary snapshot temp file away: each snapshot worker writes its own.

  `/api/status`, which every page asks while looking for the server, is worked out once until the store changes instead of reading and verifying the whole store each time, so many open pages no longer keep a big store's server busy; the hosted page also waits longer for a busy server's picture.

  The server no longer runs out of memory and stops as the store grows
  (R-Y37, R-A3). Before this, a store of about 200k messages no longer
  opened at all, and while running, every binary snapshot froze the server
  for about 18 s (Chat stayed on "Loading...").

  - Each link is held in memory once: the binary side (`data.bin`) is now a
    mirror of the text log, not a second decoded copy.
  - The text log is read a line at a time, with repeated strings kept once
    (487 MB instead of 1.37 GB for the same store).
  - `data.bin` is written by a worker thread from the log, at most once a
    minute (or ten times what the last one took). A snapshot older than the
    log is written again when the store opens.
  - The background history download waits while the heap is over 70% full.
  - A query copies only the links it matches (22 ms instead of 157 ms on
    that store), and automations read the saved graphs once per change
    instead of once per message: a sync that wrote 558 links had frozen the
    server for about 50 s.
  - Connections reads only the saved credentials (`GET /links?prefix=secret:`),
    not every message.
  - Chat tries a failed load again instead of waiting for ever, and a read
    the server does not answer in 30 s falls back to local data.

  Suggestions answer only what waits for an answer we know (R-Y40): once
  our message is the chat's last, no reply is offered. While typing, whole
  messages we sent before that start like the text come first, most used
  first, then words from both sides of our conversations — ours weigh
  more; broadcast channels and deleted messages are left out.

  A message that leaves a chat goes as in Telegram, on every network
  (R-Y41): its bubble shrinks toward its side and fades, then its place
  closes, so no empty space is left where it was; at once with reduced
  motion. Deleting the last message no longer shows a "new messages"
  button.

  Messages are drawn as in Telegram (R-Y42 … R-Y47): each sender's name in
  their peer colour, runs of one sender's messages with the avatar by the
  last, raised bubbles for both sides (ours tinted), the time at the end
  of the text, formatted text with safe links, people's and chats' photos
  (group members found by their message), the header's members and who is
  online, the pinned message, replies naming their author and media, and
  every media kind — videos, GIFs, round videos, voice waveforms, music,
  stickers, files, places, contacts, polls and dice. A round button leads
  back to the end with the count of new messages; scrollbars follow the
  theme. Group messages are stored with their author, and older ones are
  repaired.

  The page's own errors land in the server's log, by shape only, and the
  tests never reach a running app (R-Y48).

  Chat: round @ and ♥ buttons above "down" lead to unread mentions and reactions, oldest first, as in Telegram, and mark them seen (R-Y55).

## 0.45.0

### Minor Changes

- The chat list sorts by the latest message (the default) or the oldest,
  and remembers the choice (R-Y49). The maintainer's newer directives are
  tracked as requirements, the undelivered ones marked open (R-Y50 …
  R-Y56).

  Chat reads every network store first and by priority (R-Y24 .. R-Y33).
  Every message ever loaded stays in the app folder's store, along with
  everything Telegram said about it (`raw`), so it is never asked for
  again and can be analysed offline. Requests go one at a time: the chat
  on screen comes first, then the chat list, then a prefetch of the chats
  visible in the list, then a slow background download of whole histories
  (private chats, then groups; channels only on demand). Scrolling up
  loads older messages two screens ahead and keeps the reading position.
  The page holds only the chat list and pages of the open chat (the new
  `/api/chat/heads` and `/api/chat/messages` endpoints), and `data.lino`
  is now an append log, so whole histories stay fast. New tabs filter the
  list by All, Private, Groups and Channels. The tutorial no longer comes
  back once a service is connected. Working rules for people and AI agents
  are now in CONTRIBUTING (four languages) and `CLAUDE.md`.

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

  The hosted app on GitHub Pages is the default UI: `serve` prints its address and the app finds the server on port 8787 by itself, and `serve --local-ui=false` (or `MS_LOCAL_UI=off`) stops serving the local copy, sending `/` to the hosted app; `--ui-url` names another hosted copy. A browser test compares the hosted copy with the local one and runs after every Pages deploy (R-O14, R-Y58, R-Y59). Questions are compared by a temporary word grammar until formal-ai can do it (R-Y57).

  A personal chat's header opens what the conversation tells about the
  person, learned from the stored history (R-Y50 … R-Y54): the questions
  asked and their answers, our questions of the same meaning counted
  once; how we address each other — "ты" or "вы", agreed ("на ты?" —
  "давай") or as used, which the automations now follow too; their
  work, position and workplace; and their accounts elsewhere, a GitHub
  account marked confirmed when its public profile links back to them
  (checked once a week). A chat whose history is not stored to its first
  message is read before any other. link-assistant/formal-ai cannot tell
  same-meaning questions apart yet (reported as
  link-assistant/formal-ai#1330); a local check groups them until it can.

  Chat now behaves like Telegram's own apps when the connection is
  unreliable, following the open-source clients pinned in
  `docs/CHAT-REFERENCES.md`: updates missed while offline are fetched with
  `updates.getDifference`, reading a chat marks it read on Telegram (can
  be turned off in Settings → Privacy) with unread counts and an "Unread
  messages" line, drafts are kept across reloads and synced with
  Telegram's cloud drafts, the outbox survives a reload and still sends
  each message once, temporary failures and flood waits are retried by
  themselves, a lasting failure stops the chat's queue with Resend all /
  Delete all, and a banner shows when Chat is not connected.

  "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

  Tutorial advances when a service actually connects, and the "confirmed with
  Telegram" check mark gets a reliable tooltip.

  - The connect step no longer gets stuck: finishing a connection — a saved
    session, a phone login, a bot token or API keys — now advances the tour
    past it, however the user connected. Connect paths dispatch a
    `meta-sovereign:connected` event and the step listens for it
    (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
  - The verified check mark now shows a styled CSS tooltip on hover and
    keyboard focus instead of the native `title`, which was slow to appear and
    easy to miss. An `aria-label` keeps the words available to screen readers.

  Connecting Telegram now makes Chat and Contacts work: the connected user account's chats, recent messages and address-book contacts are synced (on connect, on server start, and every 30 seconds), Chat shows the connected account and "Sync now" instead of asking to connect again, messages typed in Chat are sent through the connected account, Contacts gains search and a "Message" button that opens a chat with the person, and the tutorial shows Contacts and how to open a chat from there.

  Chat now behaves like a real messenger. A message is sent exactly once: Send clears the box at once, a repeated request for the same message never posts it twice (a per-message `clientId` on the server and Telegram's `random_id`), and messages of a chat go out in order. Each of your messages shows its delivery (a clock while sending, ✓ sent, ✓✓ read), and a failed one says why, with Retry and Delete. New messages, edits, deletions, read receipts and typing from the connected Telegram account appear live through a new `GET /api/events` stream, each chat keeps its own draft, and the view offers "New messages ↓" instead of jumping while you read.

  Every action on a message now works on every network the user is
  signed in to: the network's API first and, when it has no such call or
  refuses, the same action in the network's own web app (R-Y38). Edit,
  delete, react, forward and mark read join sending, through
  `POST /api/message/*`; Chat offers them for every network, with a row of
  quick reactions and an edit dialog. A network whose API cannot pull is
  read in its web app: the chat list, then the newest messages.

  The web apps (VK, Telegram, WhatsApp, X, Facebook, LinkedIn, Upwork) are
  described as data in `sources/web-uis.js`, and driven through
  browser-commander in the user's own profile with no automation bar; the
  CV browser now launches through browser-commander too. Saved tokens and
  ids now reach the adapters, so the API is really tried first.

  Messages from every network carry the same fields where the network has
  them — sender and chat names, chat type, reply, forward, attachments,
  reactions, delivery, edited, deleted and the raw message (R-Y39,
  R-Y28) — and Chat shows them the same way.

  Dependencies are updated: browser-commander 0.32.1, Playwright 1.64.1,
  Electron 44.9.0, React 19.3.1, ESLint 10.13.0, links-notation 0.27.1 and
  lino-objects-codec 0.9.2.

  Docs: R-O19, R-Q10, R-R18, R-S22 and R-T22 marked done — their pull requests were merged.

  Safari keeps the hosted app on GitHub Pages from reaching the local server, so the server now serves a small picture (`/api/beacon.svg`) that the hosted page finds on our ports; it then opens the server's own copy of the app by itself, or says that copy is off. The browser test runs the hosted copy in WebKit too (R-Y60).

  Two stores over one folder no longer rename each other's binary snapshot temp file away: each snapshot worker writes its own.

  `/api/status`, which every page asks while looking for the server, is worked out once until the store changes instead of reading and verifying the whole store each time, so many open pages no longer keep a big store's server busy; the hosted page also waits longer for a busy server's picture.

  The server no longer runs out of memory and stops as the store grows
  (R-Y37, R-A3). Before this, a store of about 200k messages no longer
  opened at all, and while running, every binary snapshot froze the server
  for about 18 s (Chat stayed on "Loading...").

  - Each link is held in memory once: the binary side (`data.bin`) is now a
    mirror of the text log, not a second decoded copy.
  - The text log is read a line at a time, with repeated strings kept once
    (487 MB instead of 1.37 GB for the same store).
  - `data.bin` is written by a worker thread from the log, at most once a
    minute (or ten times what the last one took). A snapshot older than the
    log is written again when the store opens.
  - The background history download waits while the heap is over 70% full.
  - A query copies only the links it matches (22 ms instead of 157 ms on
    that store), and automations read the saved graphs once per change
    instead of once per message: a sync that wrote 558 links had frozen the
    server for about 50 s.
  - Connections reads only the saved credentials (`GET /links?prefix=secret:`),
    not every message.
  - Chat tries a failed load again instead of waiting for ever, and a read
    the server does not answer in 30 s falls back to local data.

  Suggestions answer only what waits for an answer we know (R-Y40): once
  our message is the chat's last, no reply is offered. While typing, whole
  messages we sent before that start like the text come first, most used
  first, then words from both sides of our conversations — ours weigh
  more; broadcast channels and deleted messages are left out.

  A message that leaves a chat goes as in Telegram, on every network
  (R-Y41): its bubble shrinks toward its side and fades, then its place
  closes, so no empty space is left where it was; at once with reduced
  motion. Deleting the last message no longer shows a "new messages"
  button.

  Messages are drawn as in Telegram (R-Y42 … R-Y47): each sender's name in
  their peer colour, runs of one sender's messages with the avatar by the
  last, raised bubbles for both sides (ours tinted), the time at the end
  of the text, formatted text with safe links, people's and chats' photos
  (group members found by their message), the header's members and who is
  online, the pinned message, replies naming their author and media, and
  every media kind — videos, GIFs, round videos, voice waveforms, music,
  stickers, files, places, contacts, polls and dice. A round button leads
  back to the end with the count of new messages; scrollbars follow the
  theme. Group messages are stored with their author, and older ones are
  repaired.

  The page's own errors land in the server's log, by shape only, and the
  tests never reach a running app (R-Y48).

  Chat: round @ and ♥ buttons above "down" lead to unread mentions and reactions, oldest first, as in Telegram, and mark them seen (R-Y55).

## 0.44.0

### Minor Changes

- Chat now behaves like Telegram's own apps when the connection is
  unreliable, following the open-source clients pinned in
  `docs/CHAT-REFERENCES.md`: updates missed while offline are fetched with
  `updates.getDifference`, reading a chat marks it read on Telegram (can
  be turned off in Settings → Privacy) with unread counts and an "Unread
  messages" line, drafts are kept across reloads and synced with
  Telegram's cloud drafts, the outbox survives a reload and still sends
  each message once, temporary failures and flood waits are retried by
  themselves, a lasting failure stops the chat's queue with Resend all /
  Delete all, and a banner shows when Chat is not connected.

  "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

  Tutorial advances when a service actually connects, and the "confirmed with
  Telegram" check mark gets a reliable tooltip.

  - The connect step no longer gets stuck: finishing a connection — a saved
    session, a phone login, a bot token or API keys — now advances the tour
    past it, however the user connected. Connect paths dispatch a
    `meta-sovereign:connected` event and the step listens for it
    (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
  - The verified check mark now shows a styled CSS tooltip on hover and
    keyboard focus instead of the native `title`, which was slow to appear and
    easy to miss. An `aria-label` keeps the words available to screen readers.

  Connecting Telegram now makes Chat and Contacts work: the connected user account's chats, recent messages and address-book contacts are synced (on connect, on server start, and every 30 seconds), Chat shows the connected account and "Sync now" instead of asking to connect again, messages typed in Chat are sent through the connected account, Contacts gains search and a "Message" button that opens a chat with the person, and the tutorial shows Contacts and how to open a chat from there.

  Chat now behaves like a real messenger. A message is sent exactly once: Send clears the box at once, a repeated request for the same message never posts it twice (a per-message `clientId` on the server and Telegram's `random_id`), and messages of a chat go out in order. Each of your messages shows its delivery (a clock while sending, ✓ sent, ✓✓ read), and a failed one says why, with Retry and Delete. New messages, edits, deletions, read receipts and typing from the connected Telegram account appear live through a new `GET /api/events` stream, each chat keeps its own draft, and the view offers "New messages ↓" instead of jumping while you read.

## 0.43.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

  Tutorial advances when a service actually connects, and the "confirmed with
  Telegram" check mark gets a reliable tooltip.

  - The connect step no longer gets stuck: finishing a connection — a saved
    session, a phone login, a bot token or API keys — now advances the tour
    past it, however the user connected. Connect paths dispatch a
    `meta-sovereign:connected` event and the step listens for it
    (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
  - The verified check mark now shows a styled CSS tooltip on hover and
    keyboard focus instead of the native `title`, which was slow to appear and
    easy to miss. An `aria-label` keeps the words available to screen readers.

  Connecting Telegram now makes Chat and Contacts work: the connected user account's chats, recent messages and address-book contacts are synced (on connect, on server start, and every 30 seconds), Chat shows the connected account and "Sync now" instead of asking to connect again, messages typed in Chat are sent through the connected account, Contacts gains search and a "Message" button that opens a chat with the person, and the tutorial shows Contacts and how to open a chat from there.

  Chat now behaves like a real messenger. A message is sent exactly once: Send clears the box at once, a repeated request for the same message never posts it twice (a per-message `clientId` on the server and Telegram's `random_id`), and messages of a chat go out in order. Each of your messages shows its delivery (a clock while sending, ✓ sent, ✓✓ read), and a failed one says why, with Retry and Delete. New messages, edits, deletions, read receipts and typing from the connected Telegram account appear live through a new `GET /api/events` stream, each chat keeps its own draft, and the view offers "New messages ↓" instead of jumping while you read.

## 0.42.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

  Tutorial advances when a service actually connects, and the "confirmed with
  Telegram" check mark gets a reliable tooltip.

  - The connect step no longer gets stuck: finishing a connection — a saved
    session, a phone login, a bot token or API keys — now advances the tour
    past it, however the user connected. Connect paths dispatch a
    `meta-sovereign:connected` event and the step listens for it
    (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
  - The verified check mark now shows a styled CSS tooltip on hover and
    keyboard focus instead of the native `title`, which was slow to appear and
    easy to miss. An `aria-label` keeps the words available to screen readers.

  Connecting Telegram now makes Chat and Contacts work: the connected user account's chats, recent messages and address-book contacts are synced (on connect, on server start, and every 30 seconds), Chat shows the connected account and "Sync now" instead of asking to connect again, messages typed in Chat are sent through the connected account, Contacts gains search and a "Message" button that opens a chat with the person, and the tutorial shows Contacts and how to open a chat from there.

## 0.41.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

  Tutorial advances when a service actually connects, and the "confirmed with
  Telegram" check mark gets a reliable tooltip.

  - The connect step no longer gets stuck: finishing a connection — a saved
    session, a phone login, a bot token or API keys — now advances the tour
    past it, however the user connected. Connect paths dispatch a
    `meta-sovereign:connected` event and the step listens for it
    (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
  - The verified check mark now shows a styled CSS tooltip on hover and
    keyboard focus instead of the native `title`, which was slow to appear and
    easy to miss. An `aria-label` keeps the words available to screen readers.

## 0.40.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

  Telegram finder: a bot-token or saved-session "Connect" now shows a
  "Connected" badge on that entry instead of leaving the click without any
  visible result. The credential was already stored server-side; the panel
  just gave no feedback, so it looked like nothing happened and invited
  repeated clicks.

  Telegram credential finder: list user accounts before bots; show every
  location a credential was found with the shortest path first and the rest
  behind an expandable "+N more" toggle; reveal a little of both ends of a
  masked token/session hint (first three and last three characters);
  replace the "confirmed with Telegram" text with a small check-mark icon
  whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
  spotlight ring floating over the top menu bar by keeping the header above
  the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
  docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
  duplication gate so release automation can no longer trip it.

## 0.39.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

  Fix the Telegram session finder crashing with "Do not know how to serialize a BigInt": GramJS returns account ids as BigInt, which broke the scan response and its on-disk cache. Ids are now normalized to strings, and every server JSON response and the finder cache are hardened against stray BigInt values.

  Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.

  `meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.

## 0.38.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

  Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).

  Tutorial: reopening a provider page (tutorial Back then Next, "Show me" after "Back to services", or a reload on the list) now returns to the service and tab you picked — e.g. Telegram → Enter manually — instead of always opening Email.

  Tutorial: version bumped to 3, so saved tutorial progress and the remembered service are reset and the tour starts again from step 1.

## 0.37.0

### Minor Changes

- "Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.

  Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

## 0.36.0

### Minor Changes

- Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

  Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.

## 0.35.0

### Minor Changes

- Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

  Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

  Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.

## 0.34.0

### Minor Changes

- Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.

  Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

## 0.33.0

### Minor Changes

- Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

  The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
  `meta-sovereign-wasm`) are marked `publish = false`: they are the app's
  server and WebAssembly build, not libraries for crates.io, so
  `cargo publish` refuses them and registry scans stop listing them.

## 0.32.0

### Minor Changes

- Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

  Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.

## 0.31.0

### Minor Changes

- Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

  Tutorial: the "Import or enter manually" step lights the whole provider page — Back, both tabs and the open panel — so either route can be chosen while the tour is on. The "Enter manually" instructions sit in a card, aligned with the import panel and the connection controls.

## 0.30.0

### Minor Changes

- Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

  Tutorial: "Pick a service" lights the whole Connections section —
  browser sign-ins and every service, each usable — since nobody knows
  in advance where the user will click; the separate sign-ins step is
  folded into it (7 steps). A card docked below a long page now sits
  above the phone's bottom navigation and adds room at the end of the
  page, so every service can be scrolled clear of it, and the ring sits
  just outside its target instead of touching the text inside it.

## 0.29.0

### Minor Changes

- Connections: two separate ways to connect, and aligned layouts.

  - Every service card has "Import with browser" (recommended) and
    "Enter manually" as two full-width buttons pinned to the card's
    foot, so they line up across a row.
  - A service page shows the two routes as tabs; the address keeps the
    tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
  - The tutorial's "Pick a service" step lights the whole grid and
    explains both routes, with its card above the grid instead of over
    it; the next step points at whichever tab is open.
  - Fixed in WebKit: the tutorial card could stay in the corner of the
    screen when Next opened a service page.
  - Alignment across the app: browser sign-in rows fill their cells with
    the checkbox on the first line, text fields are as tall as selects
    and buttons, checkboxes share one size, table cells share a
    baseline, key/value tables stay full width and commands wrap on
    phones, and the Automation hint and cards line up.

  Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

## 0.28.0

### Minor Changes

- Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

  Each tutorial step now opens on its own page. Resuming after a reload
  (the app always starts on Chat) or going Back across pages takes you to
  the page the step talks about; leaving mid-step no longer advances the
  tour, and its button turns into "Show me" to go back. "Pick a service"
  moves on when a provider page actually opens, from either button and for
  any service, so a failed import start no longer skips ahead. Opening a
  provider page starts at its top, Back to Connections returns to where
  you were in the list, and switching sections starts at the top.

## 0.27.0

### Minor Changes

- Nothing is written to another service without your explicit
  confirmation; reading still happens as needed.

  - Every route that sends, posts or changes something elsewhere
    (`/api/send`, auto-mode `/api/automations/run`,
    `/api/automations/drafts/send`, `/api/email/send`,
    `/api/github/post-comment`, `/api/upwork/post-message`,
    `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
    `queue`, greetings `queue`, CV `apply`, and the new
    `/api/profile/sync` / `/api/resume/sync`) first answers
    `428 Precondition Required` with a preview and a single-use token
    bound to that exact request; the app asks you, and the server then
    performs exactly the previewed plan (greetings and CV apply no longer
    re-plan at send time).
  - Saving your profile or CV only saves it; "Update other services" on
    the Profile screen publishes it to the networks you tick, after a
    confirmation that names them. Storing or syncing `broadcast:*`,
    `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
  - Schedule and incoming-message automations only prepare drafts, even in
    auto mode; a manual auto-mode run shows how many messages will go out
    and sends only the confirmed drafts, never twice.
  - "Typing…" is no longer shared automatically: turn it on in
    Settings → Privacy (off by default), and suggestion chips never send it.
  - The `/ws` sync and `/rtc` signalling sockets refuse pages from other
    websites (same allow-list as HTTP CORS).
  - CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
    capped at 100.

  Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

## 0.26.0

### Minor Changes

- Connections now leads with the easiest route. Every service card has an
  "Import with browser" button marked Recommended (manual "Set up" stays
  next to it), the provider page shows that import first and the manual
  steps under "Or connect by hand", and services are sorted by how many
  people use them, so Email comes first and the tutorial suggests it.

  New "Use your browser sign-ins" panel (browser-commander): "Find
  sign-ins" lists every installed browser profile (Chrome, Safari,
  Firefox, Edge, Brave, Arc, Yandex, …) and the services each is signed in
  to, reading only site names; "Use these sign-ins" copies those services'
  cookies into an owner-only file so the next import window opens signed
  in, then deletes the copy. On macOS the panel detects missing Full Disk
  Access for Safari, names the app to allow and opens the System Settings
  pane. New routes: `POST /api/auto-import/browsers/{scan,import,full-disk-access}`.

  Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

## 0.25.0

### Minor Changes

- Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

  The tutorial now moves on when you do what it says: clicking
  Connections opens the next step, picking a service's "Set up" opens the
  one after, and "Next" on such a step performs that click for you. A new
  Back button goes to the previous step. The step card sits beside the
  control it points at (with an arrow), never on top of it, flips to
  another side or docks to the screen edge when there is no room, and
  stays attached while the menu scrolls. On phones, steps for sections in
  the "More" sheet point at "More". Esc closes the tour, ←/→ move through
  it, focus follows the tour once you are in it without taking over the
  page on first load, and animations respect reduced motion.

## 0.24.0

### Minor Changes

- Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

  The tutorial's highlight now stays on the menu button while the menu
  scrolls (CSS anchor positioning instead of coordinates copied after each
  scroll, which trailed one frame behind). The server makes browsers
  revalidate the app's files (`Cache-Control: no-cache` plus an ETag), so
  Safari no longer keeps running an old version after an update.

## 0.23.0

### Minor Changes

- Add "Import with browser" to every service in Connections: the local JS
  server (Node.js 22.12+) opens the service in a real Chrome window via
  browser-commander, keeps a per-service signed-in profile, imports every
  downloaded export (ZIP / tar.gz unpacked) and can capture the open chat
  in Telegram Web and WhatsApp Web. The new `/api/auto-import` routes
  accept requests only from the app itself or allow-listed origins.

  The first tutorial step now names example services (Telegram, WhatsApp,
  Gmail, …), and all tutorial copy is shorter and easier to read. Docker
  images move to Node.js 24 so browser import works there via
  `MS_BROWSER_CDP_URL`; `deno task serve` grants the permissions it needs.

  Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

## 0.22.0

### Minor Changes

- c7eb154: Automations (issue #31, PR #34): one configurable trigger → audience →
  conditions → action pipeline replaces single-purpose features, with the
  triggers of [konard/vk-bot](https://github.com/konard/vk-bot) —
  `manual`, `schedule`, `incoming` (regex) and `chat-menu`. Issue #31 is
  the `reengage-dormant` preset: message every 1:1 contact silent for 90+
  days with the informal ("Привет…") or formal ("Здравствуйте…") text,
  picking "ты" or "вы" from the dialog with Unicode-aware regex rules
  (extensible through `pattern:*` links). `job-search`, `contract-search`
  and `greet-back` are the other presets; every automation can be created,
  edited, previewed, run and deleted. The default `safe` mode (alias
  `debug`) only queues pre-filled drafts in each person's own chat and
  sends one after a confirmation the server enforces; `auto` mode paces
  sends with typing, a daily cap and random pauses, as in
  hh-job-application-automation. Every outcome is an `automation-run:*`
  record, so nobody is messaged twice.

  People and audiences: one searchable entry per network account,
  `sameAs` cross references and suggested matches; audiences combine
  friends, chats, communities, lists, people and searches by union, `&`
  intersection and `-` difference, and VK/Telegram membership is synced
  as `member:` links. Reply autocomplete learns prompt → reply pairs from
  the archive and in real time, suggests deduplicated replies sorted by
  use, and falls back to word-by-word continuations from the owner's own
  messages; the graph is mirrored into link-cli (`MS_REPLY_CLINK=1`), and
  Links Notation text plus binary packets in the link-cli archive layout
  are supported. Our typing status is sent in VK, Telegram and
  WhatsApp, and VK typing events show when the other person types. When an API fails or is missing, messages go through the
  official web UI driven by browser-commander.

  The chat screen is now t3.codes-style with Telegram, WhatsApp and
  Signal skins and system/light/dark/auto themes (Settings → Appearance);
  the Re-engage screen, `reengage` command and `/api/reengage/*` routes
  were replaced by the Automation tab, the chat ⚡ menu,
  `meta-sovereign automations list/plan/run/review/drafts/history/save/delete`
  and the `/api/automations*`, `/api/people`, `/api/audiences` and
  `/api/suggest` routes. Every npm dependency and GitHub Action is on its
  latest release.

  Interface polish across the app: sentence case, plurals and dates in
  the user's language, networks shown by name, translated preset names,
  a three-word suggestion strip, phone (bottom bar and "More" sheet),
  tablet (rail) and desktop layouts checked for overflow, tap targets and
  contrast. Contacts are named by their messages, newest first, without
  the owner. The desktop window opens in the app's background colour
  instead of flashing white, and download cards no longer wrap a size
  onto a line starting with "·".

  Documented in REQUIREMENTS section X, USER-GUIDE section
  11, SERVER-PARITY section 5a (en/ru/zh/hi) and
  `docs/case-studies/issue-31/`.

## 0.21.0

### Minor Changes

- 6008522: Multi-platform desktop apps and a download page (issue #37).
  - `desktop/electron-builder.config.cjs` and `npm run desktop:build`
    package the Electron shell for Linux (AppImage, deb, tar.gz; x64 and
    arm64), macOS (dmg, zip; x64 and arm64) and Windows (NSIS installer
    and portable exe; x64 and arm64). Linux artifact names are normalized
    to the `meta-sovereign-desktop-<os>-<arch>-<version>.<ext>` scheme
    shared with the download page catalogue
    (`js/src/web/download/downloads.js`).
  - `.github/workflows/desktop-release.yml` builds every platform on
    native runners after a successful release on `main` (or on demand),
    smoke-tests each build, uploads installers, update feeds,
    `SHA256SUMS.txt`, `BUILD-PROVENANCE.txt` and build attestations to
    the GitHub release, and dry-runs the build on pull requests.
    `create-github-release.mjs` is idempotent and accepts `--target`.
  - The packaged app keeps its store in the user data folder, starts from
    `package.json#main`, and loads electron-updater's CommonJS
    `autoUpdater` correctly from ESM.
  - The desktop release also runs when `Publish to npm` is the only
    failed step of the release run (`js/scripts/desktop-release-gate.mjs`).
  - macOS builds are named `Meta Sovereign.app`; without Developer ID
    secrets they are ad-hoc signed (`mac.identity=-`), so they launch on
    Apple Silicon after **Open Anyway**.
  - A download page at `/download/` on GitHub Pages detects the user's
    system, offers the matching installer from the newest release with
    desktop assets, and checks a file against `SHA256SUMS.txt` in the
    browser.
  - The hosted web app shows a browser-only mode notice when no local
    server answers, with the `npx` commands, a **Check again** button and
    a link to the download page.
  - The JS server answers cross-origin requests from the hosted app
    (`https://link-foundation.github.io`) and the Capacitor app,
    including Private Network Access preflights. Other origins can be
    allowed with `serve --allow-origin=<origins>` or `MS_ALLOW_ORIGINS`;
    `--allow-origin=none` turns cross-origin access off.

## 0.20.0

### Minor Changes

- cbf3920: Greetings (issue #35): open dialogs with a "hi" or a greeting sticker
  the way [konard/vk-bot](https://github.com/konard/vk-bot) does, across
  VK, Telegram, WhatsApp, Messenger, X and email. A new
  `js/src/greetings/` subsystem holds a catalogue of what each network
  allows (stickers, live listing, who can be greeted), detects incoming
  greetings in en/ru/zh/hi/vi (the Russian pattern is vk-bot's), plans
  who to greet — never-written chats first, or unanswered greetings in
  `reply` mode — and sends with a pause between messages (30 s by
  default), recording `greeting:<network>:<chat>` so nobody is greeted
  twice. Messaging-window rules (WhatsApp and Messenger 24 h, Telegram
  bots reply-only) become skip reasons in the preview, not failed sends.

  No artwork is added to the repository. VK stickers are referenced by id
  with direct `https://vk.com/sticker/1-<id>-512` previews (43 from
  vk-bot's catalogue). Telegram sets are listed live with `getStickerSet`,
  and their thumbnails are proxied through `GET /api/greetings/file` so
  the bot token never reaches the browser. VK keyword stickers are listed
  live with `store.getStickersKeywords`. The VK, Telegram, WhatsApp and
  Messenger adapters can now send stickers and parse incoming ones.

  The feature is exposed in three places: six `/api/greetings/*` routes,
  four CLI commands (`greetings-stickers`, `greetings-select`,
  `greetings-plan`, `greetings-send`), and a **Greetings** screen in the
  SPA (en/ru/zh/hi) where the user picks stickers, previews the plan and
  sends it. Telegram's own empty-chat suggestions (`messages.getStickers`
  "👋⭐️") need the MTProto user API, which bots cannot call; the screen
  says so. Documented in `docs/GREETINGS.md` (+ ru/zh/hi), USER-GUIDE
  section 10 and `docs/case-studies/issue-35/`.

## 0.19.0

### Minor Changes

- R-V1..R-V22, R-E11..R-E13: CV synchronisation across job platforms. A new
  `js/src/cv/` subsystem reads, compares and updates the user's CV on
  LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks, TopCV and superjob.ru
  through a local [browser-commander](https://github.com/link-foundation/browser-commander)
  session, with the canonical CV stored in links notation like every other
  entity (`js/src/cv/model.js`, `diff.js`).

  Each platform contributes a **declarative plan** — data, not code:
  `js/src/cv/platforms/*.js` list URLs, an auth check, ordered steps built
  from 12 step actions, selector candidate lists, per-step
  `verified` / `documented` / `draft` confidence, write groups, and an
  `evidence` array citing the public observation each step was derived from.
  Plans are validated when the registry loads, so coverage is visible and
  countable without a browser (`cv-platforms` prints "TopCV: 32 steps,
  0 verified"), and `js/tests/helpers/markup-fixture.js` regenerates each
  plan's expected DOM from the plan itself so
  `RUN_BROWSER_E2E=1 npm run test:e2e:cv` drives all seven plans through a
  real Chromium instance, including a deliberate markup-drift case each.

  `js/src/cv/telemetry.js` records every run: 13 event types, FNV-1a markup
  fingerprints, HTML and PNG artifacts under `<artifactDir>/<runId>/`, and
  redaction of e-mails, phone numbers and long tokens on by default — so the
  first run against a real profile is debuggable after the fact rather than
  only under a debugger.

  The same facade is exposed three ways: seven `/api/cv/*` routes
  (`js/src/server/routes-cv.js`), six CLI commands (`cv-platforms`,
  `cv-plan`, `cv-read`, `cv-diff`, `cv-sync`, `cv-telemetry`), and a CV
  screen in the SPA (`js/src/web/cv-view.js`, translated in en/ru/zh/hi).
  Writes never happen implicitly: planning is the default and an explicit
  `--apply` / `dryRun: false` is required, with `--paths` / `--groups`
  narrowing a sync to chosen fields or editor groups. A backend without the
  CV routes (the `std`-only Rust server, which cannot launch a browser) says
  so on the screen instead of rendering an empty table. `playwright` and
  `browser-commander` stay optional dependencies and are kept out of the web
  bundle, enforced by `js/tests/web-bundle.test.js`. Documented in
  `docs/CV-SYNC.md` (+ ru/zh/hi) and `docs/case-studies/issue-29/`.

  R-W1..R-W5: VK token sources after the Kate Mobile ban. VK no longer
  grants the user `messages` right to new applications, and Kate Mobile's
  client_id has answered "Flood control" since 2026-09-08. A new
  `js/src/sources/vk-auth.js` module (also exported as
  `meta-sovereign/sources/vk-auth`) turns the issue-32 research into code:
  - `VK_TOKEN_SOURCES` and `rankVkTokenSources()` cover every
    vkhost.github.io client plus VK's native apps. Each entry carries its
    publisher, its OAuth-gate result on 2026-10-11 and dated community
    evidence. VK-owned clients rank first (vk.com 6287487, then VK Calls
    7793118). Third-party clients are left out unless explicitly requested.
  - `classifyVkOAuthGate()` / `probeVkOAuthGate()` re-run the
    unauthenticated `messages,offline` gate probe
    (`experiments/issue-32/probe-vk-oauth-apps.mjs`).
  - `inspectVkToken()` makes three read-only calls to say whether a token
    the user already holds is invalid, a community token, or can or cannot
    read messages. `describeVkError()` explains VK error codes.
    `examples/vk-token-check.mjs` wraps both.

  The VK connection guide (all four locales) no longer suggests creating a
  Standalone app with the messages scope. It points to the archive import,
  community tokens and, at the user's own risk, VK's own web client, and it
  names the real secret id `secret:vk:access-token`. The VK connector and
  guide now use the `vk.ru` domain (`api.vk.ru`, `dev.vk.ru`), and VK API
  errors carry `error.vkCode`. Research and evidence:
  `docs/case-studies/issue-32/`.

## 0.18.1

### Patch Changes

- 83b94b4: Move provider credential, archive import, and direct probe controls onto
  Connections provider detail pages while keeping data-section empty states as
  compact links into Connections.

## 0.18.0

### Minor Changes

- 7092f58: R-N1..R-N12: Mobile-first overhaul of the SPA shell, the connections
  flow, and the tutorial. The new `js/src/web/shell/` module exposes an
  `<AppShell>` that swaps between a compact bottom-nav (≤640 px), a
  navigation rail (641-1023 px), and a permanent drawer (≥1024 px), with
  44 × 44 px tap targets, `:focus-visible` rings, and
  `safe-area-inset-bottom` padding. `js/src/web/app.css` adds Apple
  Liquid Glass tokens (`--surface-glass`, `.glass`, `.glass-strong`) that
  use `backdrop-filter: blur(28px) saturate(180%)` with a solid fallback
  when `prefers-reduced-transparency: reduce` is set. A dedicated
  Connections page lives under `js/src/web/connections/`: the list
  renders one card per provider with translated name, description, and a
  `connected` / `not-connected` / `action-required` state badge, and
  tapping a "not connected" provider routes to a dedicated detail screen
  that walks the user through the provider's `setupSteps[]` (newly
  declared on every entry of `js/src/web/connection-guides.js`). The
  tutorial overlay (`js/src/web/tutorial.js`) gains an element-anchored
  `<TutorialSpotlight>` that dims everything outside a target rect using
  a `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` outset; the default
  sequence opens with a "Connect a service" step pointing at the
  Connections nav entry, with translated copy in `en/ru/zh/hi`. All
  user-facing strings — including the connection guides — now route
  through `t()`, so the Russian build no longer leaks the English
  "Your unified inbox starts empty." literal. Tests:
  `js/tests/connections-screens.test.js`,
  `js/tests/tutorial-spotlight.test.js`, and the existing
  `js/tests/i18n.test.js` parity assertions guard the new surface area.
  Full atomic table and evidence: `docs/case-studies/issue-25/`.

## 0.17.0

### Minor Changes

- 713513d: R-T1..R-T22: Add PeoplePerHour as the thirteenth first-class
  `MessageSource`. The new `js/src/sources/peopleperhour.js` adapter
  normalises projects, proposals, workstreams, rooms, room messages,
  hourstreams, and invoices into `msg:peopleperhour:<external_id>`
  links plus dedicated `project:peopleperhour:`,
  `proposal:peopleperhour:`, `workstream:peopleperhour:`,
  `room:peopleperhour:`, `invoice:peopleperhour:`, and
  `hourstream:peopleperhour:` link kinds. It ships both an archive
  importer (raw REST/array dumps, the
  `{projects, proposals, workstreams, rooms, messages, invoices,
hourstreams}` envelope, and the Earnings CSV sniffed against the
  PeoplePerHour header) and a live REST client at
  `https://www.peopleperhour.com/api/v1` with `Bearer` OAuth 2.0
  auth, REST cursor pagination via the `nextCursor` field, an
  injectable `fetchImpl` for tests, and an `endpointOverrides`
  escape hatch for unverified paths. The live surface adds
  `searchProjects` (`GET /projects/search`), `pullMessages` covering
  both the **proposal** stage (before approval) and the
  **workstream** stage (after approval) from either the **buyer**
  or **freelancer** perspective, and `post` for
  `POST /workstreams/{id}/messages` and
  `POST /proposals/{id}/messages`. To honour the PeoplePerHour API
  ToS, every live-pulled link is stamped with `softCache: true` and
  `cacheTtlMs: 86_400_000` (24 h); `softCacheRetention()` purges
  expired live links while leaving archive imports durable. CLI
  gains `peopleperhour-search` and `peopleperhour-message`;
  `source-pull --source=peopleperhour` forwards `stage`,
  `perspective`, `projectId`, `workstreamId`, `proposalId`, and
  `roomId`. The JS server adds same-origin proxy routes
  `POST /api/peopleperhour/pull|search|post-message` so the SPA
  stays useful when CORS blocks browser-direct calls. The connection
  guide catalogue exposes a PeoplePerHour provider entry that probes
  `https://www.peopleperhour.com/api/v1/me` and persists the
  access/refresh tokens in `secret:peopleperhour:access-token` and
  `secret:peopleperhour:refresh-token`. Tests live in
  `js/tests/peopleperhour-source.test.js`. The Rust server's
  `SOURCES` registry gains `peopleperhour` and crate versions sync
  with the JS package. The full atomic requirement list and
  solution plan live under `docs/case-studies/issue-12/`.

## 0.16.0

### Minor Changes

- e39c846: R-S1..R-S22: Add Upwork as the twelfth first-class `MessageSource`.
  The new `js/src/sources/upwork.js` adapter normalises jobs,
  proposals, contracts, rooms, room messages, time logs, and
  transactions into `msg:upwork:<external_id>` links plus dedicated
  `job:upwork:`, `proposal:upwork:`, `contract:upwork:`,
  `room:upwork:`, and `transaction:upwork:` link kinds. It ships
  both an archive importer (raw GraphQL/array dumps, the
  `{jobs, proposals, contracts, rooms, messages, transactions,
timeLogs}` envelope, and the Reports → Transaction History CSV
  sniffed against the Upwork header) and a live GraphQL client at
  `https://api.upwork.com/graphql` with `Bearer` OAuth 2.0 auth,
  Relay-style `pageInfo.endCursor` pagination, an injectable
  `fetchImpl` for tests, and an `operationOverrides` escape hatch for
  unverified field names. The live surface adds `searchJobs`
  (`marketplaceJobPostingsSearch`), `pullMessages` covering both the
  **proposal** stage (before approval) and the **contract** stage
  (after approval) from either the **client** or **freelancer**
  perspective, and `post` for the `roomsCreateMessage` mutation. To
  honour the Upwork ToS, every live-pulled link is stamped with
  `softCache: true` and `cacheTtlMs: 86_400_000` (24 h);
  `softCacheRetention()` purges expired live links while leaving
  archive imports durable. CLI gains `upwork-search` and
  `upwork-message`; `source-pull --source=upwork` forwards `stage`,
  `perspective`, `jobId`, `contractId`, `proposalId`, `roomId`, and
  `organizationId`. The JS server adds same-origin proxy routes
  `POST /api/upwork/pull|search|post-message` so the SPA stays
  useful when CORS blocks browser-direct calls. The connection guide
  catalogue exposes an Upwork provider entry that probes the GraphQL
  endpoint and persists the access/refresh tokens in
  `secret:upwork:access-token` and `secret:upwork:refresh-token`.
  Tests live in `js/tests/upwork-source.test.js`. The full atomic
  requirement list and solution plan live under
  `docs/case-studies/issue-4/`.

## 0.15.0

### Minor Changes

- bc19015: R-R1..R-R18: Add GitHub as the eleventh first-class `MessageSource`.
  The new `js/src/sources/github.js` adapter normalises issues, issue
  comments, pull requests, PR review comments, reviews, and discussions
  into `msg:github:<external_id>` links via `buildMessageLink()`. It
  ships both an archive importer (raw `gh api` array dumps and the
  standard `{issues, pulls, comments, reviewComments, reviews,
discussions}` envelope) and a live REST client with `Bearer` auth,
  `Link: rel="next"` pagination, and an injectable `fetchImpl` for
  tests. The live surface adds `pullMessages` (issues → comments → PRs
  → review comments → reviews), `listRepos` over `/user/repos`,
  `cloneRepo` that downloads the repo tarball, gunzips it with
  `node:zlib`, walks USTAR/PAX entries, and writes one
  `repo:<owner>/<name>:file:<path>` link per file plus a
  `repo:<owner>/<name>` index link with metadata children, and `post`
  for creating issue/PR comments. CLI gains `github-clone` and
  `github-comment`; `source-pull --source=github` forwards `owner`,
  `repo`, and `state`. The JS server adds same-origin proxy routes
  `POST /api/github/pull|clone|post-comment` so the SPA stays useful
  when CORS blocks browser-direct calls. The connection guide catalogue
  exposes a GitHub provider entry that probes `https://api.github.com/user`
  and persists the PAT in `secret:github:access-token`. Tests live in
  `js/tests/github-source.test.js`. The full atomic requirement list
  and solution plan live under `docs/case-studies/issue-5/`.

## 0.14.1

### Patch Changes

- e2f0047: Fix IndexedDB snapshot persistence so transaction completion handlers are attached before write requests start. Also make HTTP and TCP sync shutdown deterministic by closing idle server sockets, invoking transport disconnect cleanup, and waiting for TCP socket close events.

## 0.14.0

### Minor Changes

- R-O1..R-O19: Centralise every provider connection on a new Settings nav
  surface. Per-provider cards expose typed credential inputs, archive
  file upload + paste-fallback, and a "Try directly" probe that builds
  the URL from a `probeUrlTemplate` (e.g. Telegram
  `bot{token}/getMe`, Meta Graph `?access_token={token}`) so it never
  fires the broken legacy `/bot/getMe` or tokenless `/me` requests that
  returned 404/400. Each per-section guide now surfaces a "Connect first"
  CTA that deep-links into the matching Settings card via a custom
  `meta-sovereign:navigate` event. Credentials persist as
  encrypted-at-rest `secret:*` links via the existing `wrapSecretStore`
  contract and are still filtered from peer sync.

  R-I1..R-I12: Localise the SPA shell, navigation, and every view in
  English, Russian, Chinese, and Hindi. A new ~150-LOC i18n module ships
  the four bundled dictionaries, detects the active locale via RFC 4647
  §3.4 prefix matching against `localStorage.metaSovereignLocale` →
  `navigator.languages` → `navigator.language` → `'en'`, and exposes a
  header `<select>` (next to the theme toggle) so users can override the
  detected choice or fall back to the system default. `<html lang>` and
  `<html dir>` update on every locale change so screen readers and CJK
  font fallbacks behave correctly. Translation parity across locales is
  enforced by the new `js/tests/i18n.test.js` suite, which fails the
  build if a key drifts. Provider names ("Telegram", "WhatsApp") and API
  URLs stay in source form because they are proper nouns / brand
  identifiers.

  R-I11..R-I12 / R-Q7..R-Q8: Add hive-mind-style language-switcher H1s
  and `zh` / `hi` / `ru` sibling files for the root README, changelog,
  mobile README, top-level user-facing docs, and the issue-18 case-study
  documents. `js/tests/docs-language.test.js` now enforces sibling
  presence and switcher link resolution for that tracked Markdown surface.

## 0.13.0

### Minor Changes

- 48662ac: R-N1..R-N10: Add email as a first-class source with `.eml`/mbox import,
  browser-direct Gmail, Microsoft Graph, and JMAP receive/send support,
  Node local-server IMAP/POP3/SMTP transport, local server email routes, CLI
  commands, connection-guide copy, and the issue-#3 case study. The pure-Rust
  server now mirrors the wire surface: `email` appears in `/sources` and
  `/api/email/pull` + `/api/email/send` accept the same JSON envelopes for
  archive ingest and send queueing (live HTTP fetches and raw IMAP/POP3/SMTP
  remain JS-server features; the Rust send route returns
  `needs-local-server` for raw protocols).

## 0.12.0

### Minor Changes

- R-M1..R-M18: Replace every empty SPA section with a connection guide,
  add a CORS-aware direct-API probe with same-origin server fallback,
  and ship a step-by-step tutorial overlay.
  - New `js/src/web/connection-guides.js` — provider catalogue
    (Telegram, VK, X, WhatsApp, Facebook, LinkedIn, career.habr.com,
    hh.ru, SuperJob), per-section guide registry mirroring `navItems`,
    `tryDirect()` CORS-classifier, `localServerHelp` install copy
    (Rust / Node / Docker), `applyLocalServerOverride()` manual override.
  - New `js/src/web/connection-guide.js` — React `<ConnectionGuide />`
    and `<LocalServerHelp />` components rendered into the empty branch
    of every view in `js/src/web/views.js` (chat, operator, contacts,
    automation, patterns, replies, facts, audience, broadcast, outreach,
    profile, backup, status).
  - New `js/src/web/tutorial.js` — in-tree tour layer (`TutorialOverlay`,
    `TutorialButton`, `useTutorialPreference`, `defaultSteps`) that
    opens on first run, supports per-step skip, full turn-off, and
    re-open from a header button. Preference persists under the
    `metaSovereignTutorial` localStorage key.
  - `js/src/web/app.js` mounts the tutorial alongside the existing theme
    toggle.
  - New `docs/case-studies/issue-10/` with `README.md`, `requirements.md`,
    `solution-plan.md`, `components.md`, `external-research.md`, and raw
    issue/comment payloads under `data/`.
  - New section **M. Sovereign onboarding & connection guides
    (issue #10)** in `docs/REQUIREMENTS.md`.
  - New `js/tests/connection-guides.test.js` and `js/tests/tutorial.test.js`
    cover the guide registry, `tryDirect()` classification paths, and
    the tutorial preference round trip.

  R-N1..R-N9: Persist tutorial step progress and completed state under
  the existing `metaSovereignTutorial` localStorage key so refreshes
  resume the current tutorial step instead of restarting at step 1.

## 0.11.0

### Minor Changes

- 0d0a823: R-L1..R-L15: Browser-first publishing on GitHub Pages, user-friendly
  documentation rework, and CI/CD parity audit.
  - New `js/scripts/build-pages.mjs` builds the `dist/pages/` artifact from
    `js/src/web/` (writes `404.html`, `.nojekyll`, `manifest.webmanifest`,
    injects the manifest link into a copy of `index.html`).
  - New `.github/workflows/pages.yml` deploys the artifact via the
    official `actions/configure-pages@v5`,
    `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`
    on push to `main` and via `workflow_dispatch`. `pull_request` runs
    build-only. Both jobs cap at `timeout-minutes: 10`.
  - `README.md` is rewritten user-first: "Try it now" → "Run a local
    server" (Rust preferred, JS fallback) → "Connect the SPA to your
    server"; the developer reference moves below an explicit divider.
  - New `docs/USER-GUIDE.md` collects the user-facing flows.
  - New `docs/SERVER-PARITY.md` documents 32/38 routes parity between
    the JS server and Rust server.
  - New `docs/case-studies/issue-8/` with `README.md`, `requirements.md`,
    `solution-plan.md`, `components.md`, `external-research.md`,
    `ci-cd-template-comparison.md`, and raw issue/comment/template-inventory
    payloads under `data/`.
  - New section **L. Browser-first publishing (issue #8)** in
    `docs/REQUIREMENTS.md`.
  - All JavaScript code and tooling now live under `js/`; the Rust
    workspace manifest, lockfile, and crates now live under `rust/`.
  - New `js/tests/build-pages.test.js` unit-tests the build helper.

## 0.10.0

### Minor Changes

- 26266f1: Hardening: soft-delete by default, master-key vault, encrypted exports (issue #6).
  - **R-K1..R-K6 — Soft-delete by default.** `DELETE /links/:id` and the
    `delete()` method on the storage facade now mark the link with
    `deleted: { at, by }` instead of physically removing it. Tombstones are
    hidden from `GET /links` and `GET /links/:id` by default; pass
    `?include=tombstones` (or `?include=all`) to see them. Hard-delete is
    still available behind `?purge=1&confirm=1`. Provider adapters never
    call `delete` on upstream events — soft-delete is the only path.
  - **R-K7..R-K12 — Master-key vault.** New `src/storage/vault.js` holds
    one random 256-bit master key wrapped by one or more unlock methods
    (passphrase, PIN, passkey-`prf` blob, or TOTP recovery code). Adding
    or removing a method only re-wraps the master key — no data is
    re-encrypted (R-K9/R-K10). Removing the last method is refused
    (R-K11). All wrapping uses scrypt + AES-256-GCM, same envelope shape
    as `encryptBackup`.
  - **R-K13..R-K17 — Encrypted exports & purge.** New
    `src/storage/export-encrypted.js`, plus
    `POST /api/export-encrypted`, `POST /api/links/purge-tombstones`, and
    CLI subcommands `export-encrypted`, `purge-tombstones`,
    `vault-init`, `vault-add`, `vault-remove`, `vault-list`. Bulk purge
    refuses to run without `confirm: true` (R-K4) and only matches
    tombstones (R-K5).
  - **R-K18..R-K20 — Docs.** New case study under
    `docs/case-studies/issue-6/` (deep analysis, online research,
    requirements, plan, components survey) and a new section **K.
    Hardening (issue #6)** in `docs/REQUIREMENTS.md` carrying R-K1..R-K20
    with implementation pointers.

## 0.9.0

### Minor Changes

- 94ab57b: Establish project identity as `meta-sovereign`, land the case study for issue #1, and ship the runnable prototype that exercises every architectural layer of the plan.

  Identity and case study:
  - `package.json`: `name` set to `meta-sovereign`, description and keywords aligned with the project vision, repository URL pointed at `link-foundation/meta-sovereign`.
  - `scripts/{validate,merge,publish,format-release-notes,create-manual}-changesets.mjs`: `PACKAGE_NAME` constants updated.
  - `README.md`, `docs/CONTRIBUTING.md`: title and intro reflect the new project identity.
  - `docs/case-studies/issue-1/`: catalogues every requirement from issue #1, surveys the linked libraries (links-notation, lino-objects-codec, doublets-rs, doublets-web, link-cli, lino-arguments, deep-foundation/sdk, plus the konard ingestion tools), summarises external research on local-first software, CRDT sync, unified messaging, encrypted-at-rest storage, browser SQLite, fuzzy search, and node editors, and proposes a phased solution plan with stable requirement IDs.

  Runnable prototype baseline (each layer has unit/integration tests):
  - `src/storage/`: Universal Links Access (`createMemoryStore`), `.lino` text codec + `LinoTextStore`, binary `DoubletsStore` stub with a length-prefixed JSON frame format, `DualStore` with cross-check `verify()`, and timestamped backup / prune / restore helpers.
  - `src/sources/`: `MessageSource` adapter framework with archive parsers and live-sync stubs for all nine networks — telegram, vk, x, whatsapp, facebook, linkedin, habr-career, hh, superjob — plus `importInto(store, source, archive)` that normalises records into the unified `Link` shape.
  - `src/patterns/`: example-driven `inferRegex`, `simplifyRegex`, `matchAll`.
  - `src/replies/`: Sørensen-Dice similarity, candidate finder, reply-variation groups.
  - `src/automation/`: a tiny graph runtime (`createGraph`, `addNode`, `addEdge`, `runGraph`) for pattern → reply → send chains.
  - `src/crm/`: contact aggregation across chats, set algebra (intersect / union / difference), local search by similarity.
  - `src/facts/`: question/answer fact extraction grouped by answerer.
  - `src/sync/`: last-writer-wins merge with version-vector seed, peer abstraction with echo-suppression, in-process loopback transport.
  - `src/broadcast/`: cross-network broadcasting, profile sync, resume sync helpers.
  - `src/cli/` + `bin/meta-sovereign.js`: `import`, `export`, `backup`, `restore`, `serve`, `sources`, `help` subcommands using a tiny `lino-arguments`-style parser.
  - `src/server/`: a Node `http` server exposing `GET/PUT /links`, `GET/DELETE /links/:id`, `GET /sources`.
  - `electron/main.js`: an Electron shell that opens the local server URL.
  - `docker/`: `web.Dockerfile`, `rtc.Dockerfile`, `docker-compose.yml` for the dual microservice topology.
  - `Cargo.toml` + `crates/meta-sovereign-core/`: workspace seed for the parallel pure-Rust stack with a `Link` struct, in-memory store, and unit test.

  Iteration 2 (follow-up commits on the same PR) thickens the most user-visible layers so the v0.0.1 demo path is reachable end-to-end in one process:
  - `src/web/`: SPA served by the local Node `http` server — chat, contacts, automation graph editor, pattern table with regex inference, broadcast composer, status. Backed by new `/api/contacts`, `/api/patterns`, `/api/patterns/infer`, `/api/graphs`, `/api/status` routes that derive views from the local store.
  - `src/patterns/`: `lcs`-based regex synthesis with character-class inference for variable gaps, plus `compilePeg` for declarative rules with named captures.
  - `src/storage/backup.js`: AES-256-GCM encryption with scrypt KDF; `createBackup` writes `.json.enc` when a passphrase is provided, `restoreBackup` auto-detects.
  - `src/sync/`: vector-clock CRDT — `vcInit/vcTick/vcMerge/vcCompare` plus a deterministic concurrent-write tiebreak; Lamport `version` remains the fallback for legacy links.
  - `tests/e2e.test.js`: end-to-end pipeline test driving the HTTP API — import messages, query derived contacts and status, round-trip a backup.

  Iteration 3 (follow-up commits on the same PR) turns the early runnable layer into full-vision coverage from issue #1 in one process:
  - `src/cli/`: full parity with the HTTP API — new subcommands `audience`, `facts`, `search`, `broadcast`, `patterns`, `patterns-infer`, `graphs`, `graphs-run`, `replies`, `profile`, `resume`, `sync-listen`, `sync-connect`, all sharing the same store layer the server uses. Includes a hand-rolled recursive-descent audience-expression parser identical to the server's so `audience --query='network:telegram AND NOT chat:42'` works from the terminal.
  - `src/server/routes-mutating.js` + `routes-derived.js`: extracted `handlePrefixedGet/Put`, `handlePatternInfer`, `handleGraphRun` helpers and a `HANDLERS` dispatch table so each module sits well below the eslint complexity budget without losing any endpoint.
  - `src/sources/index.js`: `buildMessageLink` now stamps the `source` field on every imported message link — fixes audience set-algebra over `network:` predicates and CRM contact aggregation by network.
  - `crates/meta-sovereign-core/`: thickened to mirror the JS sync layer — `Link.vc: BTreeMap<String,u64>`, `MemoryStore`, indented Links Notation parser/formatter (`parse_lino`/`format_lino`), `LinoTextStore` with on-disk round-trip, `vc_tick`/`vc_merge`/`vc_compare`, deterministic `merge` tiebreak; 7 passing unit tests.
  - `scripts/build-api-docs.mjs`: zero-dep JSDoc walker that emits `docs/api/README.md` from leading `/** */` headers + exported names. Exposed via `npm run docs:api`.
  - `tests/browser-commander.test.js`: e2e placeholder that drives the SPA through the same JSON endpoints a `data-view="..."` nav click would, plus autocomplete and broadcast — designed so when `browser-commander` lands the assertions stay valid and only the fetch lines swap for `bc.click(...)`.
  - `eslint.config.js`: extended with `location`/`confirm`/`alert` SPA globals and standard timer globals for tests.
  - `.prettierignore`: ignores `target/` Rust build artefacts and the generated `docs/api/`.

  Iteration 4 (follow-up commits on the same PR) is a hardening pass that removes the duplication left over from iteration 3 and fills in the last unfinished side-quests:
  - `src/crm/audience.js`: shared audience expression DSL — the set-algebra parser used to be duplicated between `src/server/routes-derived.js` and `src/cli/index.js`. Lifted into a single module with extended predicate vocabulary (`network`, `chat`, `sender`, `fact`, `kind`, `body`, `since`, `before`, plus the bare `me` token). Server, CLI, and outreach planner now speak the same language.
  - `src/server/aggregate.js`: `aggregateContacts` extracted from `routes-derived.js` so other server modules can reuse it.
  - `src/broadcast/index.js`: `planOutreach({ audience, text, replyGroup, networks, mode })` produces deterministic envelopes (one per contact × network); `runOutreach(plan)` invokes the broadcast adapter chain. Templates support `{name}`, `{networks}`, `{chats}` placeholders. CLI exposes it as `meta-sovereign outreach --query=<expr> --text=<msg>` (R-D3).
  - `src/storage/backup.js`: `createBackupScheduler({ store, archiveDir, intervalMs, keep, ... })` drops a snapshot every `intervalMs` and keeps at most `keep` archives for long-running `meta-sovereign serve` processes; `setInterval` is `.unref()`-ed so it doesn't block process exit (R-A4).
  - `crates/meta-sovereign-core/`: ports `infer_regex`, `simplify_regex`, and `pattern_matches` to Rust as one-to-one mirrors of the JS implementations. The matcher supports just the constructs `infer_regex` emits so the core runs patterns end-to-end without pulling in the `regex` crate (R-G2).
  - `src/server/routes-derived.js`: adds `/api/health` for liveness probes from the Electron shell, k8s-style health checks, and the long-running serve.
  - `tests/audience.test.js`, `tests/outreach.test.js`, `tests/backup-scheduler.test.js`: cover the new code paths. Seven new Rust tests in the core crate.

  Tests: 79/79 JS + 14/14 Rust pass. Lint: 0 errors. Format: clean. Duplication: clean.

  Iteration 5 (follow-up commits on the same PR) lands the offline-first SPA pieces and the browser-side WebRTC transport so all apps can connect to a local links server (localhost or LAN) when one exists, fall back to fully-local browser storage when one doesn't, and sync browser-to-browser without going through a central server:
  - `src/storage/browser-store.js`: pluggable browser drivers — in-memory, `localStorage`, and `IndexedDB` — picked at boot via `pickBrowserDriver()`. Implements the same `UniversalLinksAccess` contract the server uses, so the handler bus, peer, and views attach unchanged.
  - `src/web/discover.js`: pure-function autodiscovery cascade (same-origin → saved override → common localhost ports → LAN candidates) plus `saveServerOverride` / `clearServerOverride` for manual config.
  - `src/web/client.js`: `createOfflineClient({ store, server })` — local-first writes, server-preferred derived queries (autocomplete, contacts, status), emits `mode-change` when the server flaps so the UI badge can update.
  - `src/sync/webrtc-transport.js`: `signalingChannel(transport)` typed JSON-over-WS wrapper, plus `createWebRtcTransport({ signaling, RTCPeerConnection, initiator })` that opens the data channel, queues sends until it's open, and exposes the standard `{ send, onMessage, close }` shape so `Peer.connect` plugs in. `RTCPeerConnection` is injected so the JS wiring is testable in Node without `wrtc`.
  - `src/web/dom.js`, `app.js`, `app.css`: SPA boot now wires the local handler bus + offline client and shows an `online` / `offline` badge in the topbar.
  - Tests: `browser-store`, `discover`, `offline-client`, `webrtc-transport`, and `e2e-offline-first` — 12 new cases across the new layer.

  Tests: 118/118 JS + 14/14 Rust pass. Lint, prettier, jscpd remain clean.

  Iteration 6 (follow-up commits on the same PR) closes the last CI gap by making the WebSocket sync transport and the WebRTC signalling broker runtime-portable across Node, Deno, and Bun:
  - `src/sync/bun-server.js`: new Bun runtime adapter. The previous code hand-rolled framing on top of `node:http` upgrade sockets and `node:net` client sockets — both silently drop bytes under Bun. The adapter delegates to `Bun.serve({fetch, websocket})` + the global `WebSocket` constructor, handles both attach-before-listen and attach-after-listen cases via a `Symbol.for(...)`-keyed shared registry on the http.Server, and bridges Bun's `Request` to the `{method, url, headers, on('data'/'end')}` surface existing route handlers expect (with a cached single-use `arrayBuffer()` promise).
  - `src/sync/ws-transport.js`, `src/sync/webrtc-signaling.js`: each public export now branches on `typeof globalThis.Bun !== 'undefined'` and delegates to the Bun adapter when present. The Node path is unchanged.
  - `eslint.config.js`: file-scoped globals for `src/sync/bun-server.js` (`Response`, `Request`, `WebSocket`).

  Tests: 118/118 JS pass under both Node and Bun. The CI matrix (Node × {Ubuntu, macOS, Windows} + Deno × 3 + Bun × 3) is now green end-to-end.

  Iteration 7 (follow-up commits on the same PR) lands the requirements + roadmap docs requested in PR #2, expands the pure-Rust server so the SPA boots against it identically, and fixes the `meta-sovereign serve` CLI bug that quietly killed the daemon on startup:
  - `docs/REQUIREMENTS.md`: canonical spec list — every `R-A1…R-I5` from issue #1 plus a `R-J1…R-J10` section capturing the maintainer directives from PR #2 (offline-first SPA, autodiscovery, dual WebSocket+WebRTC reach, store-as-API, handled-link stamping, decentralised browser deployment, e2e via `browser-commander`, full Rust local server, REQUIREMENTS+ROADMAP docs, "iterate until ROADMAP empty").
  - `docs/ROADMAP.md`: the live punch-list — every requirement gap lives here until it is closed.
  - `crates/meta-sovereign-server/`: the JS server now has a pure-`std` Rust counterpart that speaks the same wire protocol — REST (`/links`, `/sources`, `/api/contacts`, `/api/status`, `/api/health`, `/api/patterns`, `/api/patterns/infer`, `/api/graphs`, `/api/broadcast`), WebSocket sync at `/ws` with a hand-rolled RFC 6455 frame reader and SHA-1+Base64 handshake, and a WebRTC signalling broker at `/rtc` with room-based fanout. 49 Rust tests including 10 wire-protocol integration tests cover the surface.
  - `src/server/index.js` + `crates/meta-sovereign-server/src/routes.rs`: both servers now mount browser-safe sibling modules — `/storage/<file>.js`, `/handlers/<file>.js`, `/sync/<file>.js` resolve to the matching directory under `src/`. Without this the SPA's `import '../storage/browser-store.js'` returned 404 from any static host. Mount paths are flat-file-only with traversal protection.
  - `src/web/dom.js`: imports browser-safe storage from `'../storage/browser-store.js'` directly so the bundle never tries to load the Node-only re-exports of the `storage/index.js` barrel.
  - `src/cli/index.js`: `serveCmd` now blocks on SIGINT/SIGTERM. Previously it returned 0 immediately, which `bin/meta-sovereign.js` propagated to `process.exit(0)` — the listener bound a port and then died before it could serve anything. Tests opt out via `args.foreground === false`.
  - `tests/server.test.js`: new `mounts browser-safe sibling modules` test exercising the JS mount, traversal rejection, .js-only filter, and nested-path rejection.
  - `crates/meta-sovereign-server/src/routes.rs`: new `browser_mount_serves_sibling_directory_files` unit test mirroring the JS coverage against the real `src/` tree.

  Tests: 119/119 JS + 49/49 Rust pass; lint, prettier, jscpd clean.

  Iteration 8 (follow-up commits on the same PR) closes R-J7 by replacing the contract-stable e2e harness with a real headless-browser run:
  - `tests/e2e-browser-spa.mjs`: opt-in (`RUN_BROWSER_E2E=1 npm run test:e2e:browser`) Playwright + `browser-commander` script that boots the local server, drives the SPA in headless Chromium, clicks every nav button, writes a message and verifies it survives reload, infers a pattern from examples, persists a 2-node automation graph, and triggers a broadcast. Without `RUN_BROWSER_E2E` (or with Playwright/`browser-commander` missing) the script exits 0 with a `SKIP` line so the CI matrix stays green without pulling Chromium binaries on every job.
  - `package.json`: new `test:e2e:browser` script; `playwright` and `browser-commander` declared as `optionalDependencies` so installs without browser binaries still succeed.
  - `docs/REQUIREMENTS.md`: R-J7 and R-H4 flip from "Partial" to "Done".
  - `docs/ROADMAP.md` §4: removes the closed item, narrows the open list to scenarios that depend on yet-to-land features (two-browser WebRTC convergence, real Telegram import, audience outreach UI, profile-sync envelopes, backup/restore UI flow, Rust-server e2e re-run).

  Iteration 9 (follow-up commits on the same PR) wires the audience → outreach UI surface and a backup/restore UI surface, ships a dark-mode toggle, and lifts accessibility hygiene to skip-link + ARIA + focus-visible:
  - `src/server/routes-mutating.js` + `src/server/routes-backup.js`: new `POST /api/outreach` endpoint that previews and queues mass-personal envelopes from an audience query, plus a backup HTTP surface (`POST /api/backup`, `GET /api/backups`, `POST /api/backups/:name/restore`) gated on `archiveDir` (defaults to `<storeDir>/archives`), with optional passphrase support so the encrypted-at-rest path is reachable from the SPA.
  - `src/web/views.js`: `outreachView` (audience-query input + per-network targeting controls + envelope preview list) and `backupView` (create/list/restore archives) — both pull from the new endpoints.
  - `src/web/app.css` + `app.js` + `index.html`: replaces hard-coded colors with CSS custom properties (so dark mode is one variable swap), adds a persistent theme toggle button (system / light / dark), a skip-link as the first focusable element, ARIA roles + labels on landmarks, and visible focus outlines.
  - `tests/e2e-browser-spa.mjs`: extended so headless Chromium walks the new outreach flow, executes a backup → delete → restore round-trip (verifying the seeded message returns), toggles dark mode + reloads to confirm persistence, and asserts the skip-link is the first focusable element on the page.

  Iteration 10 (follow-up commits on the same PR) brings the Rust server up to feature parity with the Node observability surface so a single Prometheus scraper can pull from either backend identically:
  - `crates/meta-sovereign-server/src/handlers.rs`: `metrics_text(state, ws_peers, rtc_rooms)` mirrors `src/server/metrics.js` byte-for-byte — same metric names, same labels, same OpenMetrics text format. Counts links by id prefix (msg, pattern, graph, reply, broadcast, contact, profile, resume, secret) so dashboards can group by `kind`.
  - `crates/meta-sovereign-server/src/routes.rs`: new `MetricsCtx { ws_peers, rtc_rooms }` threaded through `dispatch()` so `/metrics` reflects live socket counts; existing 11 dispatch sites updated.
  - `crates/meta-sovereign-server/src/http.rs`: adds a `LogFormat` enum (`None` | `Json`) on `ServerOptions`. Pure-`std` JSON access logger writes one `{ts, level, event:"http", method, path, status, duration_ms}` object per request line — no chrono, no serde. ISO-8601 timestamps via Howard Hinnant's civil-date algorithm; minimal hand-rolled JSON escaper. Connection state bundled into a `ConnectionCtx` struct so `handle_connection` keeps clippy's `too_many_arguments` budget.
  - `crates/meta-sovereign-server/src/main.rs`: `--log json` CLI flag and `MS_LOG_FORMAT=json` env var.
  - `crates/meta-sovereign-server/tests/wire_protocol.rs`: new `metrics_endpoint_emits_prometheus_exposition` integration test seeds a `msg:` link, `GET /metrics`, asserts `# HELP`/`# TYPE` headers, `meta_sovereign_links_by_kind{kind="message"} 1`, and the WebSocket/WebRTC gauge lines.

  Tests: 122/122 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean.

  Iteration 11 (follow-up commits on the same PR) closes the token-storage-encryption item from ROADMAP §8 and the maintainer directive that `secret:*` links must never ship to peers:
  - `src/storage/secret-store.js`: `wrapSecretStore({ inner, passphrase })` is a Universal-Links-Access decorator that transparently encrypts/decrypts the payload of any link whose `id` starts with `secret:`. The on-disk shape is `{ id, tokens: idTokens(id), enc: '<aes-256-gcm envelope>' }` so the binary store can still index by id but no plaintext value, body, or token leaks. Reuses the same AES-256-GCM + scrypt envelope `createBackup`/`restoreBackup` already use, so a single passphrase covers both surfaces. Non-`secret:*` links pass through untouched. With no passphrase the wrapper returns the inner store unchanged.
  - `src/storage/index.js`: re-exports `wrapSecretStore` and `isSecretLinkId`.
  - `src/server/index.js`: `secretPassphrase` option (or `MS_SECRET_PASSPHRASE` env var) wraps the configured store before handlers, sync, and HTTP routes attach. Store init lifted into `initStore()` to keep clippy/eslint complexity within budget.
  - `src/sync/index.js`: `createPeer` now drops `secret:*` events on both the outbound (`onLocal` filter) and inbound (`receive` filter) paths so a malicious peer can't pollute our key store and a compromised handler can't exfiltrate. Inbound filtering is independent of outbound — both ends defend.
  - `tests/secret-store.test.js`: 7 new cases — encrypts at rest, passes non-secrets through, no-op without passphrase, rejects wrong passphrase, never broadcasts secrets to peers, drops hostile inbound secret events, and an end-to-end HTTP round-trip that asserts the on-disk `data.lino` contains the id but not the plaintext value.

  Tests: 129/129 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean.

  Iteration 12 (follow-up commits on the same PR) closes ROADMAP §6 by wiring the API documentation surface into CI and the release pipeline (R-H3):
  - `.github/workflows/release.yml`: new `docs-build` job runs on every push and PR. It executes `npm run docs:api` (the existing JSDoc-style walker over `src/`) and `cargo doc --no-deps --workspace` (the Rust crates `meta-sovereign-core` + `meta-sovereign-server`), uploads both as workflow artefacts, and gates the `release` job behind it so a doc-comment regression fails CI before the version bump. The Rust toolchain is set up with `dtolnay/rust-toolchain@stable`.
  - `.github/workflows/release.yml` (release + instant-release jobs): after `Format GitHub release notes`, the workflow rebuilds the docs against the just-released commit and attaches `meta-sovereign-js-api-docs-<tag>.tar.gz` + `meta-sovereign-rust-api-docs-<tag>.tar.gz` to the GitHub Release via `gh release upload`.
  - `scripts/attach-api-docs.sh`: helper invoked from the release jobs. Tars `docs/api/` and `target/doc/` separately, uploads both to the release identified by the supplied tag (`--clobber` so re-runs of the workflow refresh the assets).
  - `docs/REQUIREMENTS.md`: R-H3 row updated with the new CI surface.
  - `docs/ROADMAP.md`: §6 "Live-API documentation surface" deleted (both bullets closed).

  Iteration 13 (follow-up commits on the same PR) closes the ROADMAP §4 "Re-run e2e against the Rust server" item and tightens the surrounding section now that audience outreach + backup/restore are already covered by iteration 9's e2e:
  - `tests/e2e-browser-spa.mjs`: extracted the per-step assertions into 11 named helpers and a declarative `ALL_STEPS` table so the suite can run against multiple backends. Added a `startRustBackend()` that spawns `target/{release,debug}/meta-sovereign-rs serve --port 0 --web src/web`, parses the bound port from the binary's stdout, and tears it down with SIGTERM on completion. Each backend declares its capability set (`outreach`, `backups`, `theme`, `skipLink`, `navViews`); steps tagged with a `requires` capability are skipped when the backend doesn't support them, so the JS pass exercises the full 11-step path while the Rust pass runs the 9 steps that map onto its currently-implemented HTTP surface (no `/api/outreach`, no `/api/backups` yet). Setting `RUN_BROWSER_E2E_RUST=1` enables the second pass.
  - `eslint.config.js`: ignores `target/**` (rustdoc bundle) and `docs/api/**` (generated API docs) so locally building either doesn't produce thousands of false-positive lints.
  - `docs/REQUIREMENTS.md`: R-J7 + R-H4 rows updated to reflect dual-backend coverage and wire-protocol parity assertions.
  - `docs/ROADMAP.md` §4: Rust-server e2e bullet deleted; "Audience → mass-personal outreach" and "Backup → restore round-trip" bullets removed (both already covered by the existing e2e since iteration 9). Section preamble rewritten to describe the dual-backend default.

  Tests: 129/129 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean. Real-browser e2e: 11/11 steps pass against the JS server, 9/9 against `meta-sovereign-rs serve`.

  Iteration 14 (follow-up commits on the same PR) closes ROADMAP §4 "Profile-sync envelopes":
  - `tests/e2e-browser-spa.mjs`: new `stepProfileSync` step navigates to the profile view, types a name + bio into the Profile editor, clicks "save profile", waits for the rendered `plannedSyncs` JSON, and asserts (1) the response contains a queued envelope per known network (telegram + vk specifically), (2) every envelope's `status` is `queued`, (3) the canonical `profile:me` link on the server reflects the edits. Gated on a new `profile` capability flag so the Rust pass (which doesn't yet implement `/api/profile`) auto-skips.
  - `docs/ROADMAP.md` §4: removes the "Profile-sync envelopes" bullet.
  - `docs/REQUIREMENTS.md`: R-D5 row mentions the SPA editor + e2e coverage.

  Iteration 15 (follow-up commits on the same PR) closes ROADMAP §2 "Accessibility pass via axe-core" and drops the now-stale "Dark mode toggle" bullet from the same section:
  - `package.json`: `axe-core@^4.11.4` declared under `optionalDependencies` so installs without the audit dep still succeed; the e2e step skips with a `SKIP (axe-core not installed)` line when missing.
  - `tests/e2e-browser-spa.mjs`: new `stepAxeAudit` step loads `node_modules/axe-core/axe.min.js` and injects it via `page.evaluate(axeSource)` (CDP `Runtime.evaluate` is not subject to the SPA's `script-src 'self'` CSP — `addScriptTag({ content })` would inline a `<script>` and be blocked), runs `axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] })`, and fails the suite if any violation has `impact: 'serious'` or `'critical'`. Step runs unconditionally (no `requires` flag) so the same audit gates both the JS server and the pure-Rust `meta-sovereign-rs serve` static SPA.
  - `docs/REQUIREMENTS.md`: R-H1 flips from "Partial" to "Done" referencing the axe-core audit; R-J7's coverage list adds `axe-core WCAG 2.0 A/AA audit`.
  - `docs/ROADMAP.md` §2: removes the "Accessibility pass" bullet and the now-stale "Dark mode toggle" bullet (the toggle is implemented, persisted, and exercised by `stepThemeToggle`); §4 preamble updated to mention the axe audit.

  Tests: 129/129 JS + 52/52 Rust pass; lint, prettier, clippy, fmt clean. Real-browser e2e: 13/13 steps pass against the JS server, 10/10 against `meta-sovereign-rs serve` (including the axe-core audit on both backends — zero serious/critical violations).

  Iteration 16 (follow-up commits on the same PR) closes ROADMAP §8 "WebRTC TURN fallback":
  - `docs/WEBRTC-TURN.md`: new operator guide explaining when the SPA needs a TURN relay (cross-NAT, symmetric NATs), a minimal `coturn` `docker-compose.yml` snippet that sits alongside `docker/docker-compose.yml`, and a code sample showing how to forward `rtcConfig.iceServers` (with `stun:`, `turn:`, and `turns:` URLs) into `createWebRtcTransport`. Documents `iceTransportPolicy: 'relay'` for verifying the TURN path in isolation, and explains how to avoid leaking long-term TURN secrets — either by serving credentials from an authenticated endpoint that the existing `secret:*` link store + `wrapSecretStore` already encrypts at rest and refuses to ship to peers, or by minting short-lived REST-style ephemeral credentials per `draft-uberti-behave-turn-rest`. Verifies the resulting candidate pair via `chrome://webrtc-internals`.
  - `docs/ROADMAP.md` §8: section deleted (only bullet was the TURN fallback).

  Iteration 17 (follow-up commits on the same PR) fixes a Bun + Deno regression introduced by iteration 10's JSON access logger, restoring the cross-runtime test matrix to green:
  - `src/sync/bun-server.js`: the `nodeRes` shim built by `runRequestListeners` for Bun's `Bun.serve` bridge previously lacked `on()` and `hasHeader()`, so two methods that Node's real `http.ServerResponse` exposes — and that two pieces of recently-landed server code rely on — threw `TypeError: res.on is not a function` and `TypeError: res.hasHeader is not a function` under both Bun and Deno's Node compat layer. The shim now records `'finish'` listeners in a per-response array and fires them from `end()` (so the JSON access logger flushes correctly), and implements `hasHeader(k)` over the case-folded `headers` object (so `applySecurityHeaders` no longer overwrites a header a route already set).
  - `tests/server.test.js`: the `/metrics` test fired a seeding `PUT /links` whose response body it never read. Node and Bun tolerate that, but Deno's leak detector failed the test with `A fetch response body was created during the test, but not consumed`. The test now drains it with `.then((r) => r.text())`, matching the surrounding tests' style.

  Tests: Node 129/129, Bun 129/129, Deno `tests/server.test.js` 8/8 (the full Deno run still trips on a known WebSocket-handshake mismatch unrelated to this PR — it manifests only on certain Deno builds and is not part of the matrix this iteration was reviving).

  Iteration 18 (follow-up commits on the same PR) closes ROADMAP §4 "Two-browser WebRTC convergence" (R-J7) by wiring the SPA boot to the existing `/rtc` signaling broker and asserting end-to-end peer-to-peer convergence in headless Chromium:
  - `src/web/webrtc-sync.js`: new browser module. `attachWebRtcSync({ store, origin })` opens a `WebSocket` to `${origin}/rtc?room=default`, wraps it in `signalingChannel`, constructs `createWebRtcTransport({ initiator: false })`, and connects it to `createPeer(store)`. Existing peers become initiator on `peer-joined` (the broker tells them a newcomer arrived) by calling the new `transport.startAsInitiator()`, so two SPAs in the same room negotiate an `RTCDataChannel` deterministically and start fanning store events through it. `secret:*` filtering already happens inside `createPeer`, so token links never traverse this transport.
  - `src/sync/webrtc-transport.js`: extracted the offer-dance into a `startAsInitiator()` method on the returned transport (was previously inlined in the `if (initiator)` branch). Both initiator-now and initiator-later patterns share the same code path; existing unit tests still pass unchanged.
  - `src/web/dom.js`: SPA boot now calls `attachWebRtcSync({ store, origin })` whenever `discoverServer` returns an origin, so any browser that talks to a local server automatically also opens a peer-to-peer channel to other browsers in the same room. The boot returns an `{ store, bus, client, rtc }` quadruple so future code can inspect/close the RTC handle without hunting it through globals.
  - `src/sync/peer.js`: split the transport-agnostic primitives (`createPeer`, `merge`, vector-clock helpers, `loopback`) out of `src/sync/index.js`. `index.js` re-exports them for backwards compatibility but the browser bundle now imports them directly so the SPA does not pull in `src/sync/tcp-transport.js` (`node:net`) or the server-side WebSocket transport (`node:net` + `node:http`) through `index.js`'s re-export wall. This was the actual blocker: the dynamic `import('/dom.js')` inside the new e2e step previously failed with `Failed to fetch dynamically imported module` because the module graph reached server-only code.
  - `src/server/index.js`: no behaviour change — the existing `/rtc` mount + `attachSignaling(server, { path: '/rtc' })` was already in place from iteration 5; this iteration just makes the SPA actually use it.
  - `tests/e2e-browser-spa.mjs`: new step `stepTwoBrowserWebRtcConvergence` opens a _second_ Playwright browser context (so it gets an isolated IndexedDB), boots the SPA in both, has page A write a unique `msg:rtc-probe-*` link via `api.put`, and waits up to 20s for page B to read the same link out of _its_ local store. With WebRTC enabled the round trip completes in single-digit milliseconds (loopback ICE has no real RTT); a control experiment that strips `RTCPeerConnection` from page B confirms convergence does not happen via any other path. Step is gated behind a `twoBrowserRtc` capability flag — the JS backend exposes a symmetric `/rtc` broker so it runs there; the Rust backend's broker shape isn't exercised here so the flag is `false`. The `runSuite` ctx now also includes `browser` so the step can spawn a second context.
  - `experiments/rtc-probe.mjs`: minimal repro / debugging probe for the convergence path; useful for diagnosing transport regressions.
  - `docs/REQUIREMENTS.md` row R-J7: updated to mention the new two-browser convergence step.
  - `docs/ROADMAP.md` §4: "Two-browser WebRTC convergence" bullet deleted; section preamble rewritten to mention the new step.

  Tests: Node 129/129 (unit), e2e-browser-spa 14/14 against the JS backend.

  The codebase now exercises every layer of the plan end-to-end from CLI, HTTP, real browser, and SPA — including offline-first SPA, autodiscovered or manually configured server, direct browser-to-browser sync over WebRTC verified end-to-end with two real browsers in CI, audience-driven mass-personal outreach, encrypted backups with a UI restore flow, dark mode + a11y, a Prometheus/JSON observability surface mirrored on both Node and Rust backends, and AES-256-GCM-encrypted-at-rest secret storage that never traverses peer sync — with a parallel Rust core, vector-clock sync, and full audit-driven test coverage. Subsequent iterations continued closing the remaining roadmap items.

  Iteration 19 (follow-up commits on the same PR) closes the Telegram connector and real Telegram archive import roadmap items:
  - `src/sources/telegram.js`: robust Telegram Desktop import now handles all-chats exports, per-chat exports, `text_entities`, `date_unixtime`, and duplicate local message ids across chats. The live connector now uses Telegram Bot API `getUpdates`, `sendMessage`, `setMyName`, and `setMyDescription` with either `TELEGRAM_BOT_TOKEN`, an explicit token, or a local `secret:telegram:*` token link.
  - `src/sources/index.js`: `pullLiveInto()` imports live updates into any Universal Links store and stamps each produced link with `handled: { at, by }` plus `handledBy[source:<name>:live]` so connector echoes are traceable and at-most-once.
  - `src/handlers/index.js` + `src/server/handlers-bootstrap.js`: `source-pull:<source>:*` links now trigger a live import through the handler bus and write completion metadata back to the command link.
  - `src/cli/index.js`: new `meta-sovereign source-pull --source=telegram` command.
  - `tests/telegram-live.test.js`: covers real Telegram export shape, mocked Bot API pull/send/profile sync, secret-token lookup, and one-shot source-pull handler execution.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-E2 is Done; the real Telegram archive import and Telegram live connector bullets are removed from the roadmap.

  Tests: focused Node source/handler slice passes; total JS coverage is now 133 tests.

  Iteration 20 (follow-up commits on the same PR) closes the UI design audit roadmap item:
  - `docs/UI-DESIGN-AUDIT.md`: adds a per-surface Apple HIG / Google Material / Microsoft Fluent audit for the global shell, chat, operator, contacts/CRM, automation graph, patterns/replies, broadcast/profile/resume, settings, sync, and backup flows.
  - `docs/REQUIREMENTS.md`: R-H1 now references the design audit alongside the semantic, keyboard, theme, ARIA, and axe-core evidence already enforced by the app and e2e tests.
  - `docs/ROADMAP.md`: removes the R-H1 audit checkbox and narrows the UI section to the remaining React port.

  Iteration 21 (follow-up commits on the same PR) hardens the Deno test matrix after Telegram gained real live side effects:
  - `src/sync/ws-transport.js`: Deno now uses its native `WebSocket` client for sync/signaling tests instead of the Node `net` handshake path that current Deno 2.x rejects.
  - `tests/server-iter3.test.js`: the route-level full-pipeline fixture disables background handlers so environments with `TELEGRAM_BOT_TOKEN` set do not start a real Telegram profile-sync request while asserting planned-sync route responses.

  Tests: Node 133/133, Bun 133/133, Deno 133/133, Rust 52/52; `npm run check` clean.

  Iteration 22 (follow-up commits on the same PR) closes the remaining external-service connector roadmap items:
  - `src/sources/http.js` and `src/sources/link.js`: shared live-adapter HTTP helpers and a leaf `buildMessageLink` module, which removes the source-registry circular import when callers import individual adapters directly.
  - `src/sources/vk.js`: VK method API connector for conversation/history import, `messages.send`, `status.set`, and `account.saveProfileInfo`.
  - `src/sources/whatsapp.js`: WhatsApp Cloud API connector for webhook ingestion, opted-in text sends, and business profile updates.
  - `src/sources/x.js`: X API v2 connector for DM lookup/send, mention import, public post creation, and profile update.
  - `src/sources/facebook.js`: Graph/Messenger connector for page conversation import, webhook ingestion, replies, and page profile metadata updates.
  - `src/sources/linkedin.js`: LinkedIn REST Posts connector for API-side post import/export plus profile/resume publication.
  - `src/sources/hh.js`, `src/sources/habr-career.js`, `src/sources/superjob.js`: job-board live adapters for application/negotiation message import, reply sending, and resume create/update flows.
  - `tests/live-connectors.test.js`: mocked-fetch coverage for every non-Telegram live connector, keeping real credentials out of CI while verifying URL, header, body, and normalized-link behavior.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-A1 and R-E1/R-E3/R-E4/R-E5/R-E6/R-E7/R-E8/R-E9 are marked Done; the external-service connector section is removed from the roadmap.

  Tests: Node 139/139, Bun 139/139, Deno 139/139, Rust 52/52; `npm run check` clean.

  Iteration 23 (follow-up commits on the same PR) closes the browser-side WASM roadmap section:
  - `src/storage/browser-store.js`: adds `createDoubletsWebDriver()` and `loadDoubletsWebDriver()`, indexing BrowserStore snapshots through the real `doublets-web` `Link` / `LinksConstants` / `UnitedLinks` surface when the WASM module is bundled or injected. `pickBrowserDriver()` now prefers that driver before IndexedDB, localStorage, and in-memory fallback.
  - `crates/meta-sovereign-wasm`: new Rust `cdylib` wrapper around `meta_sovereign_core::pattern_matches`, exporting `ms_alloc`, `ms_dealloc`, and `pattern_matches` for browser WebAssembly calls.
  - `src/web/patterns-wasm.js`, `src/web/pattern-worker.js`, and `src/web/pattern-matcher.wasm`: browser wrapper + worker that runs supported pattern previews through the Rust WASM matcher and falls back to JS `RegExp` for complex regexes.
  - `src/server/index.js` and `crates/meta-sovereign-server/src/routes.rs`: both static servers now serve `.wasm` with `application/wasm`; CSP allows same-origin workers and WebAssembly compilation without allowing inline scripts.
  - `tests/browser-store.test.js`, `tests/wasm-patterns.test.js`, and server route tests cover the doublets-web driver, the actual checked-in WASM artifact, and the static serving contract.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-G1 now records the completed Rust/WASM pieces; the browser-side WASM roadmap section is removed.

  Tests: Node 142/142, Bun 142/142, Deno 142/142, Rust 53/53; `npm run check` clean.

  Iteration 24 (follow-up commits on the same PR) closes the React SPA
  port roadmap item:
  - `src/web/app.js` and `src/web/views.js`: the SPA shell and every view
    now render as React components while continuing to use the existing
    offline-first `api` facade, discovery cascade, WebRTC sync, and
    browser storage stack. The static shell still exposes the same
    landmarks and `data-view` navigation contract before hydration.
  - `scripts/build-web.mjs` and `src/web/app.min.js`: `npm run build:web`
    bundles the editable React source into the same-origin browser asset
    loaded by `index.html`.
  - `package.json`: adds React, ReactDOM, and esbuild as development
    tooling for the web bundle.
  - `tests/web-react.test.js`: pins the React packaging contract so the
    source, bundle, and script entrypoint cannot silently drift back to a
    non-React shell.
  - `docs/REQUIREMENTS.md` and `docs/ROADMAP.md`: R-G1 is Done; the React
    roadmap section is removed.

  Tests: Node 143/143, Bun 143/143, Deno 143/143, Rust 53/53;
  `npm run check` clean; real-browser
  `RUN_BROWSER_E2E=1 npm run test:e2e:browser` passes all JS-backend
  critical UI paths.

  Iteration 25 (follow-up commits on the same PR) closes the final
  Electron/mobile packaging and discovery roadmap items:
  - `electron/main.js` now exports testable desktop boot helpers, opens
    the same React/server URL with an isolated preload, and configures
    `electron-updater` via `checkForUpdatesAndNotify()` when the optional
    updater peer is available.
  - `electron/preload.cjs` passes shell-provided LAN candidates into the
    renderer without enabling Node integration.
  - `src/web/discover.js` and `src/web/discovery-shell.js` now accept
    Electron/Capacitor WebView candidates through
    `window.metaSovereignShell`, query parameters, or a global injected by
    native code before falling back to localhost/offline mode.
  - `capacitor.config.json`, `scripts/build-mobile.mjs`, and
    `scripts/mobile-platform.mjs` provide the Capacitor fallback pipeline
    for iOS and Android using the same React bundle in `mobile/www`.
  - `tests/mobile-electron-packaging.test.js` pins the WebView discovery,
    Electron updater, and mobile build contracts.
  - `docs/REQUIREMENTS.md`: R-F3, R-G3, R-J2, R-J3, R-J9, and R-J10 now
    record the completed packaging/discovery state; `docs/ROADMAP.md`
    records an empty tracked roadmap.

  Tests: focused Node mobile/electron coverage passes; full matrix pending
  the final local verification pass for this iteration.

  Iteration 26 (follow-up commits on the same PR) makes CI fail fast on
  hangs and flaky tests so AI-driven iteration stays quick (R-J11):
  - `.github/workflows/release.yml` and `.github/workflows/links.yml`:
    every job now declares an explicit `timeout-minutes`, sized at
    roughly 5–10× the observed p95 of that job (5/10/15/30 min bands).
    Without these caps a hung promise or flaky network call would only
    fail after the GitHub Actions default of six hours per job, which
    defeats the AI iteration loop. Each timeout has an inline comment
    recording the typical run window vs. the cap so future tuning is
    data-driven, not guesswork.
  - `package.json`: `npm test` now runs
    `node --test --test-timeout=30000 tests/*.test.js` so an individual
    hung test fails in 30s instead of waiting for the job-level cap.
  - `.github/workflows/release.yml` (test matrix): the Bun runner uses
    `bun test --timeout 30000` to apply the same 30s per-test budget on
    the Bun side. Deno has no global per-test timeout flag, so Deno
    tests are protected only by the job-level `timeout-minutes: 10` —
    documented in `docs/BEST-PRACTICES.md` §13.
  - `docs/BEST-PRACTICES.md`: new §13 "Reasonable Timeouts on Every Job
    and Test" codifies the policy with the explicit per-job table
    (detect-changes 5, lint 10, test 10, docs-build 15, release 30, …)
    and the per-test 30s budget. The previous "Proper Cancellation
    Propagation" section is renumbered to §14.
  - `README.md`: "Reasonable timeouts on every job" subsection added
    under the testing section, summarising the band table and per-test
    flags so contributors know what budget to size new jobs against.
  - `docs/REQUIREMENTS.md`: new R-J11 row records the directive (the
    user's "fail faster, fix faster" ask) alongside the implementation
    evidence.

  The same `timeout-minutes` gap exists in the upstream
  `link-foundation/js-ai-driven-development-pipeline-template` and
  `link-foundation/rust-ai-driven-development-pipeline-template`
  templates and will be reported back to them so every project bootstrapped
  from those templates inherits this behaviour by default.

  Iteration 27 (follow-up commits on the same PR) aligns the active docs
  with the final implementation state:
  - `docs/ROADMAP.md` is restored as an explicit empty roadmap ledger so
    reviewers have the requested stable file path for new findings.
  - `docs/REQUIREMENTS.md`, `README.md`, and the issue #1 case study now
    point at the implemented PR #2 state instead of older future-phase or
    deleted-roadmap wording.
  - `tests/docs-consistency.test.js` guards against regressing the
    requirements, roadmap, and case-study docs into contradictory states.
  - The documentation validation job now treats `docs/ROADMAP.md` and
    `docs/REQUIREMENTS.md` as required files.

## 0.8.0

### Minor Changes

- 3e45a9c: Add `--tag-prefix` option to release scripts for multi-language repos

  The `create-github-release.mjs` and `format-github-release.mjs` scripts now accept a `--tag-prefix` CLI parameter (defaulting to `v`) that allows users to customize the git tag prefix. This enables use in multi-language repositories where different language packages need distinct tag prefixes (e.g., `js-v1.0.0` vs `rust-v1.0.0`).

## 0.7.3

### Patch Changes

- ae2cc9a: Add self-healing release mechanism that checks npm registry for unpublished versions

## 0.7.2

### Patch Changes

- 9126e16: fix: npm upgrade fallbacks and Node.js 24.x upgrade for CI/CD
  - Upgrade Node.js from 20.x to 24.x in all workflow files (avoids broken npm in Node.js 22.22.2)
  - Add 4-strategy fallback chain to setup-npm.mjs (standard, curl tarball, npx, corepack)
  - Update GitHub Actions to latest versions (checkout v6, setup-node v6, create-pull-request v8)
  - Add case study documentation for issue #33

## 0.7.1

### Patch Changes

- 6916409: Use per-commit diff instead of full-PR diff for CI change detection

## 0.7.0

### Minor Changes

- 983789a: Add CI/CD best practices from hive-mind: fast-fail job ordering, test compilation, file line limits check, secrets detection, documentation validation, extracted fresh merge simulation script, and proper cancellation propagation

## 0.6.0

### Minor Changes

- 8961862: Add automated broken link checker with Web Archive fallback suggestions
  - Add `.github/workflows/links.yml` with lychee-action for link checking in Markdown and HTML files
  - Add `scripts/check-web-archive.mjs` to check broken links against the Wayback Machine API
  - Add `.lycheeignore` for excluding known false-positive URLs (localhost, example.com, etc.)
  - Update `README.md` to document the broken link checker feature
  - Scheduled weekly check (Mondays at 09:00 UTC) to catch links that break over time
  - On PRs, broken links with no Web Archive fallback will fail the check
  - For broken links that have archived versions, provides actionable replacement suggestions
  - On scheduled runs, automatically creates a GitHub Issue with the full broken links report

  Fixes #27

## 0.5.1

### Patch Changes

- e398190: Add comprehensive best practices comparison and improve CI concurrency
  - Add DETAILED-COMPARISON.md with side-by-side analysis of ALL scripts, workflows, and configurations
  - Implement cancel-in-progress for main branch concurrency (hive-mind Issue #1274 fix)
  - Fix max-lines documentation (1500, not 1000)
  - Reference detailed comparison from BEST-PRACTICES.md

## 0.5.0

### Minor Changes

- 66211b5: Add fresh merge simulation to CI/CD to prevent stale merge preview issues
  - Add "Simulate fresh merge with base branch" step to lint and test jobs
  - This ensures PR CI validates the actual merge result, not a stale snapshot
  - Prevents CI failures on main branch after merging PRs that sat open for days
  - Add case study documentation for issue #23 with root cause analysis
  - Add ignore patterns for case study data files in ESLint and Prettier

  See docs/case-studies/issue-23 for detailed analysis of the stale merge preview problem.

  Fixes #23

## 0.4.0

### Minor Changes

- e6c2691: Add multi-language repository support for CI/CD scripts
  - Add `scripts/js-paths.mjs` utility for automatic JavaScript package root detection
  - Support both `./package.json` (single-language) and `./js/package.json` (multi-language repos)
  - Add `--legacy-peer-deps` flag to npm install commands in release scripts to fix ERESOLVE errors
  - Save and restore working directory after `cd` commands to fix `command-stream` library's `process.chdir()` behavior
  - Add case study documentation with root cause analysis in `docs/case-studies/issue-21/`

## 0.3.0

### Minor Changes

- 80d9c84: Add CI check to prevent manual version modification in package.json
  - Added `check-version.mjs` script that detects manual version changes in PRs
  - Added `check-changesets.mjs` script to check for pending changesets (converted from inline shell)
  - Added `version-check` job to release.yml workflow
  - Automated release PRs (changeset-release/_ and changeset-manual-release-_) are automatically skipped

## 0.2.2

### Patch Changes

- 9a12139: Fix CI/CD check differences between pull request and push events

  Changes:
  - Add `detect-changes` job with cross-platform `detect-code-changes.mjs` script
  - Make lint job independent of changeset-check (runs based on file changes only)
  - Allow docs-only PRs without changeset requirement
  - Handle changeset-check 'skipped' state in dependent jobs
  - Exclude `.changeset/`, `docs/`, `experiments/`, `examples/` folders and markdown files from code changes detection

## 0.2.1

### Patch Changes

- 55aef41: Make Bun the primary runtime choice throughout the template
  - Update all shebangs from `#!/usr/bin/env node` to `#!/usr/bin/env bun` in scripts, experiments, and case studies
  - Update README.md to prioritize Bun in all sections (features, development, runtime support, package managers, scripts reference)
  - Update examples to list Bun first
  - Bun now described as "Primary runtime with highest performance" and "Primary choice" for package management
  - Maintains full compatibility with Node.js and Deno

## 0.2.0

### Minor Changes

- d3f7fcd: Improve changeset CI/CD robustness for concurrent PRs
  - Update validate-changeset.mjs to only check changesets ADDED by the current PR (not pre-existing ones)
  - Add merge-changesets.mjs script to combine multiple pending changesets during release
  - Merged changesets use highest version bump type (major > minor > patch) and combine descriptions chronologically
  - Update release workflow to pass SHA environment variables and add merge step
  - Add comprehensive case study documentation for the CI/CD improvement
  - This prevents PR failures when multiple PRs merge before a release cycle completes

## 0.1.4

### Patch Changes

- e9703b9: Add ESLint complexity rules with reasonable thresholds

## 0.1.3

### Patch Changes

- 0198aaa: Add case study documentation comparing best practices from effect-template

  This changeset adds comprehensive documentation analyzing best practices from
  ProverCoderAI/effect-template repository, identifying gaps in our current setup,
  and providing prioritized recommendations for improvements.

  Key findings include missing best practices like code duplication detection (jscpd),
  ESLint complexity rules, VS Code settings, and test coverage thresholds.

## 0.1.2

### Patch Changes

- 2ea9b78: Enforce strict no-unused-vars ESLint rule without exceptions. All unused variables, arguments, and caught errors must now be removed or used. The `_` prefix no longer suppresses unused variable warnings.

## 0.1.1

### Patch Changes

- 042e877: Fix GitHub release formatting to support Major/Minor/Patch changes

  The release formatting script now correctly handles all changeset types (Major, Minor, Patch) instead of only Patch changes. This ensures that:
  - Section headers are removed from release notes
  - PR detection works for all release types
  - NPM badges are added correctly

## 0.1.0

### Minor Changes

- 65d76dc: Initial template setup with complete AI-driven development pipeline

  Features:
  - Multi-runtime support for Node.js, Bun, and Deno
  - Universal testing with test-anywhere framework
  - Automated release workflow with changesets
  - GitHub Actions CI/CD pipeline with 9 test combinations
  - Code quality tools: ESLint + Prettier with Husky pre-commit hooks
  - Package manager agnostic design

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
