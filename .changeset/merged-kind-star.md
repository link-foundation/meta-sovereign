---
'meta-sovereign': minor
---

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
