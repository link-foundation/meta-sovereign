---
'meta-sovereign': minor
---

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
