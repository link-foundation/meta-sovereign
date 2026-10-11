# Issue 31 Case Study: automations that re-engage personal contacts after a long silence

Issue: https://github.com/link-foundation/meta-sovereign/issues/31

Prepared on 2026-10-11 UTC for PR 34.

## Summary

Issue 31 asks for a way to message every personal contact the user has
not talked to for a long time — "at least 90 days" — with one of two
fixed texts:

```
Привет

Тебе или твоим друзьям на текущий момент нужна помощь с автоматизацией? Есть открытые вакансии?
```

```
Здравствуйте

Вам или вашим друзьям на текущий момент нужна помощь с автоматизацией? Есть открытые вакансии?
```

Which text a contact gets depends on whether the dialog used "ты" or
"вы" more, and that has to be detected automatically "using regexes or
peg grammars or similar", ideally through the project's own rules. The
issue also requires a safe (debug) mode in which only one message is
pre-filled at a time and goes out only after the user confirms it.

The first round (commits up to 127e7a1) built this as a dedicated
**Re-engage** screen, a `reengage` command and `/api/reengage/*` routes.
The review of PR 34 asked for something more general: outreach should
be an **automation** — a trigger, an audience, conditions and an action
the user can change — that runs in the ordinary chat, and the work
should also bring message-to-message autocomplete, typing status, a
t3.codes-like chat with switchable themes and skins, the associative
storage stack (links notation text + binary, link-cli), sending through
the official web UIs when an API fails, and every dependency updated.
The second round replaced the dedicated screen with that design.

What is in the pull request now:

1. **Detection, unchanged in substance.** `js/src/crm/address-form.js`
   is a data-driven table of word-level regex rules (Russian ты/вы plus
   Chinese 你/您 and Hindi तुम/आप) with an explainable
   `detectAddressForm()`: the winning form, the reason (`majority`,
   `tie`, `no-evidence`), a confidence and the rules that fired. Users
   can add rules as `pattern:*` links labelled `address:informal` /
   `address:formal`. `js/src/crm/reengage.js` remains the library that
   finds 1:1 chats silent for at least N days and picks the template.
2. **Automations** (`js/src/automation/`). An `automation:<id>` link
   holds triggers (manual, chat menu, schedule, incoming message
   pattern — after konard/vk-bot's triggers), an audience, conditions
   (silent days, mutual, personal, who wrote last, networks, cooldown),
   the ты/вы templates, the mode and the pacing. Issue 31 is the
   `reengage-dormant` preset; job search, contract search and greet-back
   are others. **Safe mode** (the default) writes one
   `automation-draft:*` link per person, shown prefilled in that chat,
   and nothing leaves until the user clicks Send. **Auto mode** sends
   like a person — typing status for as long as the text takes to type,
   a random pause, a daily cap (vk-bot's outgoing queue, plus
   hh-job-application-automation's caps, de-duplication ledger and
   confirm-before-send). Every outcome is an `automation-run:*` link,
   which is also the cooldown.
3. **People and audiences** (`js/src/crm/people.js`). One searchable
   entry per `<source>:<user>` built from messages, `person:`,
   `member:` (friends, chat and community membership) and `list:`
   links, with cross-network matches suggested as `sameAs`. Audiences
   are specs like `friends:vk & chat:vk:2000000001 - list:blocked`
   (union, intersection, difference), saved and resolved anywhere.
4. **Reply graph** (`js/src/replies/`). Every (incoming message → our
   reply) pair is a link with a count; the composer first offers every
   reply used before for the chat's last message, deduplicated and most
   used first, then word-by-word completion from the owner's own
   messages. It learns from imported archives and in real time. A
   link-cli (`clink`) database mirrors the graph
   (`reply-store-clink.js`, `MS_REPLY_CLINK=1`).
5. **Storage**: `doublets-archive.js` writes records as a deduplicated
   doublets network in the link-cli binary archive layout
   (`clink --import-binary` reads it), and `lino-store.js` keeps the text
   half as one links-notation record per line (`lino-objects-codec`).
6. **Delivery and typing** (`js/src/sources/`). VK, Telegram and
   WhatsApp adapters show and receive typing status; `browser-sender.js`
   sends through vk.com, web.telegram.org and web.whatsapp.com via
   browser-commander when the API throws or is not configured.
7. **Front ends.** The **Chat** tab (t3.codes-like by default) has a
   ⚡ Automations menu in every chat, the drafts, typing indicators and
   suggestions; the **Automation** tab edits, previews and runs
   automations, searches people and saves audiences; **Settings →
   Appearance** chooses system / light / dark / auto (by the hour) and
   the t3.codes, Telegram, WhatsApp or Signal skin. The `automations`
   CLI and `/api/automations`, `/api/people`, `/api/audiences`,
   `/api/lists`, `/api/send`, `/api/typing`, `/api/suggest` routes cover
   the same ground; the SPA falls back to its local links offline.
8. **Dependencies**: every npm package and GitHub Action at its latest
   release (eslint 10, jscpd 5, React 19.3, playwright 1.64,
   browser-commander 0.31, links-notation 0.25, …).

## Local Artifacts

Raw GitHub data is preserved under `data/`: `issue-31.json`,
`issue-31-comments.json` (none), `pr-34.json`,
`pr-34-conversation-comments.json` (the review that started the second
round is the comment of 2026-10-11T17:26:45Z), `pr-34-review-comments.json`
and `pr-34-reviews.json` (none).

Screenshots under `screenshots/` were taken with Playwright against
`experiments/automations-spa-server.mjs`, which seeds a store (Telegram
"Аня" on "ты" and VK 2002 on "вы", both silent for months; an e-mail
contact whose fake sender always fails; a recent VK chat; three chats
where the owner answered "Как дела?" twice one way and once another)
and replaces sending and typing with fakes that only log:

- `chat-skin-{t3,telegram,whatsapp,signal}-{light,dark}.png` — the same
  chat with issue 31's draft in every skin and theme.
- `chat-automation-menu.png` — the ⚡ Automations menu of a chat: test an
  automation on this chat, or run it with its conditions.
- `chat-reply-suggestions.png` — "Как дела?" was answered before, so the
  composer offers both answers, the one used twice first.
- `chat-word-suggestions.png` — no reply matches "Привет!", so typing
  "Отлично, " completes word by word; "спасибо", the word that followed
  "Отлично" in the owner's messages, comes first.
- `automations-editor-preview.png` — issue 31's automation in the
  editor with its preview: two to message (one formal, one informal) and
  why the rest are left out.
- `settings-appearance.png` — Settings → Appearance.

The first round's `reengage-*.png` screenshots showed the removed
screen; they are in the history at commit 127e7a1.

`experiments/automations-cli-roundtrip.mjs` runs issue 31's automation
from the terminal against an on-disk store (plan, run in safe mode,
review with scripted answers `f`, `m`, `s`, then plan again from the
reopened store); its output is `verification-logs/automations-cli-roundtrip.log`.
The `experiments/clink-*.mjs` probes measure link-cli's query and import
costs that shaped the reply store.

## Root Questions and Answers

**What is a "personal contact"?** A chat is personal when the adapter
says so (Telegram exports' `personal_chat`, Bot API `private`) or, for
VK, when the peer id is a user id (positive and below 2 000 000 000).
Groups, channels, saved messages and bots are excluded. By default the
owner must have written in the chat at least once (`requireMutual`),
so spam that was never answered is not "a contact we used to talk to".

**Who is the owner?** `me` always is; `--self=<ids>` adds more. With no
explicit ids, the sender that appears in the most chats of a source is
taken to be the owner when it appears in at least two — in a pile of
1:1 dialogs only the owner is in all of them.

**How is ты/вы decided?** Each message is scored with the rule table;
the owner's own messages count twice (the new message is the owner's,
so how the owner addressed the contact matters most). The larger total
wins. A tie or no evidence falls back to the polite "вы": an unexpected
"вы" is merely stiff, an unexpected "ты" can be rude. The decision is
always shown with its evidence and can be flipped with one click / key.

**Why not a full PEG grammar?** The decision only needs counts of
second-person markers, and word-level regexes with Unicode-aware
boundaries are enough for that while staying editable as data. The
hard cases are lexical, not syntactic: `-ете`/`-ите` endings also close
nouns in the prepositional case ("в интернете", "на сайте"), so only a
curated list of polite verbs is counted, while `-ешь`/`-ишь` endings are
safe to count morphologically. `js/tests/address-form.test.js` keeps
these collisions as regression tests ("выход", "работы", "тыква",
"в интернете", "на сайте" must not count).

**What does "safe mode" guarantee?** A safe-mode run only writes
drafts. A draft is sent by `sendDraft(id, { confirm: true })` and by
nothing else; without `confirm` it throws `ConfirmationRequiredError`,
and `POST /api/automations/drafts/send` answers 400 `confirm-required`.
In the app the confirmation is the Send click on that one draft. A
failed send keeps the draft so it can be edited, sent by hand or
skipped. Auto mode started by hand or from a chat menu also needs
`confirm: true` (the app asks once); schedule and incoming triggers
were authorised when the automation was switched on, and still respect
the pacing and the daily cap.

**Why automations instead of a feature?** The review asked for
"universal configurable solutions, not specific features that are not
changeable by user". Every part of issue 31 — 90 days, personal chats
only, the two texts, ты/вы, safe mode — is now a field of an editable
automation, and the same machinery covers asking about vacancies,
offering contract work or greeting back.

**Why is the reply graph answered from memory when link-cli is the
store?** link-cli 1.0.0 (Rust) and 4.0.0 (.NET) scan every link per
query, so a lookup costs tens to hundreds of milliseconds as the graph
grows (`experiments/clink-query-scaling.mjs`) — too slow per keystroke.
The in-memory index answers keystrokes; the clink database is the
persisted, queryable mirror kept in step with it.

**What if the app cannot send through a network?** The adapter's API
is tried first and the official web UI second, through
browser-commander in a persistent profile the user signed into once.
If both fail the draft stays, with an "Open chat" link where the
platform documents one (`mailto:` with the body prefilled,
`tg://user?id=`, `https://vk.com/im?sel=`), and **I sent it myself**
records a manual send, so the contact is handled either way.

## Requirements

See [`requirements.md`](./requirements.md) for the full mapping of the
issue text and of the PR 34 review to R-X1 … R-X21 and to the tests that cover them. The same
table is section X of [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md).

## Solution Plan

See [`solution-plan.md`](./solution-plan.md).

## External Research

See [`external-research.md`](./external-research.md) — deep links that
open a chat (RFC 6068, Telegram, VK) and how VK peer ids encode the
chat type.

## Known Limits

- Telegram contacts imported from an export are numeric ids, so the
  "Open chat" link is `tg://user?id=…`, which opens the chat but cannot
  prefill text. Telegram does document a prefilled link for usernames
  and phone numbers (`t.me/<username>?text=…`), which can be used once
  an importer records usernames.
- Address-form rules cover Russian, Chinese and Hindi. Other languages
  with a T–V distinction (German du/Sie, French tu/vous, …) can be added
  as `pattern:*` links without code changes, but none ship by default.
- Web UI sending depends on each site's markup (`WEB_UIS` in
  `browser-sender.js`); a redesign of vk.com, web.telegram.org or
  web.whatsapp.com needs that table updated. It is tested against a fake
  browser session, not against the live sites.
- WhatsApp Cloud API ties typing indicators to the incoming message
  being answered, so it can only show typing in a reply.
- The link-cli mirror needs the `clink` binary and is off unless
  `MS_REPLY_CLINK=1`; suggestions never wait for it.
- The Rust server does not implement the automation, people and
  suggestion routes yet (see `docs/SERVER-PARITY.md` section 5a).
