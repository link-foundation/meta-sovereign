---
'meta-sovereign': minor
---

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
onto a line starting with "·". Documented in REQUIREMENTS section X, USER-GUIDE section
11, SERVER-PARITY section 5a (en/ru/zh/hi) and
`docs/case-studies/issue-31/`.
