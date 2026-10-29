# Roadmap (languages: en • [zh](ROADMAP.zh.md) • [hi](ROADMAP.hi.md) • [ru](ROADMAP.ru.md))

## Who meta-sovereign is for

The [product vision and UI guidance](PRODUCT-VISION.md) defines our direction:
T3 Code for visual style and configurability, Telegram for baseline messaging
features and interactions across providers. The status tables below describe
current implementation separately from that target.

meta-sovereign represents **a person or an organisation online**. One owner connects the accounts they speak through — Telegram, VK, WhatsApp, Facebook and Instagram, X, LinkedIn, email, GitHub, Upwork, PeoplePerHour and job boards — and works every conversation from one app that runs on their own machine. The data stays theirs: a local store, encrypted backups, no cloud in between.

The same inbox, contacts and automations serve four kinds of work:

- **Personal**: keep in touch with people, remember what was said, keep a CV the same everywhere.
- **Sales**: find and segment leads across networks, reach out one by one at scale, follow up, answer fast.
- **Marketing**: broadcast to audiences, publish posts, grow and know communities.
- **User support**: one queue for every incoming message, answers from the community or business account, canned replies and a knowledge base of facts.

This file maps each scenario to its **critical paths**: what works today, what is partial, and what is next. The per-network detail is in [`FEATURES.md`](./FEATURES.md) and [`features/`](./features/); every requirement and its evidence is in [`REQUIREMENTS.md`](./REQUIREMENTS.md).

## How to read the status

- **Ready**: works end to end in the app and is covered by tests. Tests use fakes; only Telegram's message display was also checked, read-only, against a real store (see "Verification" below).
- **Partial**: works with the limit named in the row.
- **Planned**: not built yet; listed under "Next" in priority order.
- **Not possible**: needs something only the official apps have, or a public server the local app does not run.

## Foundation: what every scenario relies on

| Critical path                    | Status  | Requirements                    | What works / what is missing                                                                                                                                                                                                                                                         |
| -------------------------------- | ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connect an account               | Partial | R-P\*, R-W\*, R-Z9              | Telegram (API sign-in), VK (token), email (IMAP/SMTP), GitHub (token): Ready. WhatsApp (QR in a visible WhatsApp Web window), Facebook and LinkedIn (signed-in browser), X (pasted token), Upwork and PeoplePerHour (unverified APIs): Partial. No OAuth screens yet (next, item 2). |
| Every message in one inbox       | Partial | R-Y\*, R-Z5, R-Z8, R-Z10, R-Z11 | Telegram is a full client; VK (Long Poll), email (incremental IMAP), GitHub (issues, PRs, notifications) keep current by themselves. The others are read from their archives (any size, R-Z23) and thinly from their web apps.                                                       |
| Send once, with an honest status | Ready   | R-Z3, R-Z4, R-Z24               | Each send is made at most once (draft `clientId`, outbox); an unclear result is "unknown", never retried by itself; a send the network took stays "sent" even when the disk is full.                                                                                                 |
| Data that is yours and safe      | Ready   | R-Z1, R-Z2, R-Z14, R-Z16, R-Z17 | Local store that survives crashes and full disks, streamed encrypted backups, automatic schema migrations, encrypted secrets, a local server that refuses other sites.                                                                                                               |
| Every device in step             | Ready   | R-F\*, R-L\*                    | Web app, desktop app with the server inside, WebRTC/WebSocket sync between your devices, offline writes replayed later.                                                                                                                                                              |

## Personal

| Critical path                    | Status  | Requirements       | What works / what is missing                                                                                                                               |
| -------------------------------- | ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reconnect with people gone quiet | Ready   | R-X\*, R-Z3        | "Say hi to contacts silent for 90 days" and other presets, ты/вы detected per dialog, safe drafts or paced auto-send, quiet hours, cooldown, opt-out list. |
| Greet with a hi or a sticker     | Ready   | R-Z3               | Telegram and VK; WhatsApp greetings need the Cloud API credentials (personal WhatsApp has none).                                                           |
| Remember what was said           | Ready   | R-C\*, R-D1        | Facts (`question → answer`) taken from conversations; one view of everything known about a contact; reply suggestions from your own past replies.          |
| One CV everywhere                | Partial | R-V\*              | Read, compare and write profiles through your own browser; the plans for most job sites are drafts not yet run on the real sites.                          |
| Freelance and job platforms      | Partial | R-S\*, R-T\*, R-Z8 | Upwork and PeoplePerHour inbox pulls (fakes only), job-board archives. No proposals, job search or apply.                                                  |

## Sales

| Critical path                          | Status  | Requirements      | What works / what is missing                                                                                                                                        |
| -------------------------------------- | ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every lead in one CRM                  | Ready   | R-D1, R-D4        | Contacts gathered from every network, the same person on other networks shown as cross references, search across people, chats and messages.                        |
| Segment leads                          | Ready   | R-D2, R-X13, R-Z7 | Audience specs (`friends:vk & chat:vk:… - list:blocked`), saved lists and audiences, chat and community members kept fresh daily.                                   |
| Reach out one by one at scale          | Ready   | R-D3, R-Z3        | Mass-personal outreach: a personal text per contact, preview of who gets what and why the rest are left out, at most once, paced, daily caps, quiet hours, opt-out. |
| Follow up                              | Ready   | R-X\*             | Automations by schedule or on a matching reply: "not again for N days", "who wrote last", "only chats where you wrote too".                                         |
| Answer fast                            | Ready   | R-C\*             | Reply suggestions while typing (Tab takes one), patterns and reply variations, the Operator queue.                                                                  |
| Pipeline stages, reminders, deal value | Planned | —                 | Next, item 5.                                                                                                                                                       |
| LinkedIn as a sales channel            | Partial | R-Z4, R-Z10       | Messages go through the LinkedIn web app (unverified selectors); `messages.csv` import; Connections are not imported yet.                                           |

## Marketing

| Critical path             | Status  | Requirements       | What works / what is missing                                                                                                                          |
| ------------------------- | ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broadcast to an audience  | Ready   | R-D3, R-Z3         | Broadcasts go through the same outbox as every automated send: once per person, paced, skipped for bots, blocked and left chats and the opt-out list. |
| Publish posts             | Partial | R-Y\*, R-Z4        | Telegram channels: Ready. LinkedIn feed post (`publishPost`, text, author URN typed by hand) and X posts (text only): Partial. VK wall: Planned.      |
| Grow and know a community | Partial | R-X13, R-Z7, R-Y\* | VK community members and Telegram groups and channels (members, admins, invite links); VK community join and wall are not built.                      |
| Unsubscribe and consent   | Partial | R-Z3               | The opt-out list is honoured by every automated send; a "stop" reply is not yet added to it by itself (next, item 6).                                 |
| Campaign results          | Planned | —                  | The outbox records every result (sent, failed, unknown); there is no report page yet (next, item 6).                                                  |

## User support

| Critical path                                      | Status               | Requirements         | What works / what is missing                                                                                                                                                                                   |
| -------------------------------------------------- | -------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One queue for every incoming message               | Ready                | R-B\*                | The Operator page walks unread messages chat by chat across networks; the chat list shows who wrote last.                                                                                                      |
| Answer as the community or business                | Partial              | R-Z8, R-Y179, R-Y180 | VK community token (Bots Long Poll: new, edited and own replies, typing): Ready. Telegram Business (quick replies, greeting, away, hours, chatbot): Partial. Support mailbox (email) and GitHub issues: Ready. |
| Canned answers and auto-replies                    | Ready                | R-C\*, R-X\*         | Automations on an incoming message matching a pattern (safe drafts by default), Telegram quick replies, reply suggestions.                                                                                     |
| A knowledge base                                   | Ready                | R-C\*                | Facts (`question → answer`) collected from past answers and checked in the chat.                                                                                                                               |
| Business webhooks (WhatsApp Cloud, Facebook Pages) | Not possible locally | —                    | A webhook needs a public HTTPS address; the app runs on your machine. Pages and Cloud API messages are pulled or read in a browser instead (next, item 3).                                                     |
| A team answering together                          | Planned              | —                    | One owner per app today; several operators, assignment, internal notes and roles are next, item 4.                                                                                                             |

## Next, in priority order

Nothing below has a date; each item gets a requirement id when work starts.

1. **Live verification.** Run each network's critical paths once against a real account owned by the user, with the user watching (only Telegram's display has been checked so far, read-only). Until then a row is "tested with fakes".
2. **Guided sign-in.** OAuth with refresh for Gmail and Outlook.com, X OAuth, the GitHub device flow and a guided VK token, so no one pastes a one-hour token.
3. **Business inbound without webhooks.** Pull Facebook Page conversations and WhatsApp Cloud API messages on a schedule where the API allows it; say plainly where only a webhook would work.
4. **Team mode for organisations.** Several operators on one server, each with their own sign-in; assign a chat, internal notes, who answered, roles.
5. **Sales pipeline.** Stages on contacts, follow-up reminders and a "due today" list, deal value.
6. **Campaign results and consent.** A report per automation and broadcast (sent, answered, opted out, unknown) and "stop"-style replies added to the opt-out list by themselves.
7. **Richer sending.** Replies, photos and files on VK, X and email (attachments, Sent copy, signatures).
8. **Publishing.** VK wall posts, the LinkedIn post lifecycle (edit, delete, media), X media posts.
9. **Job seekers.** Recruiter inboxes on job boards in a signed-in browser, CV plans run on the real sites.

Owner-only, not done by the app: publishing the npm package, checking web selectors against the user's real accounts.

## Verification

Every critical path is covered by tests with fakes. Only Telegram's message display was also checked against a real store (counts only, read-only); no send was made from a real account. So Ready means "works against the documented API or web app", not "seen working on the real network". Item 1 closes this.

## Done

Requirements R-A to R-Z24 are done; [`REQUIREMENTS.md`](./REQUIREMENTS.md) lists each one with its evidence and known limits. The audit waves R-Z1 to R-Z24 hardened the server, store, sending, email, CI, imports, GitHub, VK, WhatsApp, pages, backups, migrations and full-disk handling. The issue #1 history is kept in [`case-studies/issue-1/solution-plan.md`](./case-studies/issue-1/solution-plan.md). The Rust server is documented, not at parity: [`SERVER-PARITY.md`](./SERVER-PARITY.md).
