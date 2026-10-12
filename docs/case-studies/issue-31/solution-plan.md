# Solution Plan

The work landed in two rounds of atomic commits, each useful on its own.
Round 1 (up to `127e7a1`) answered the issue with a dedicated Re-engage
screen, command and routes. The PR #34 review asked for a universal,
configurable automation instead, so round 2 kept the detection core,
replaced the dedicated front ends, and added everything else the review
listed. Paths are relative to `js/src/`.

## 1. Detection core (`crm/`, kept from round 1)

- `address-form.js` — the rule table (`defaultAddressRules`), the
  scorer (`scoreAddressForm`), the dialog verdict
  (`detectAddressForm`) and user rules from `pattern:*` links
  (`addressRulesFromPatterns`).
  - Word boundaries are built from `[\p{L}\p{M}\p{N}_]` look-arounds,
    because `\b` only knows ASCII letters and would match "ты" inside
    "работы".
  - Weak markers (greetings, imperatives) weigh 0.5, pronouns and verbs
    weigh 1, the owner's messages count twice.
- `reengage.js` — `findDormantContacts`, `prefillLinkFor`, the default
  texts, and the chat helpers (`personalPartner`, `groupByChat`) that
  automations and people now share. Chat kind comes from the adapter's
  `chatType` when present, else from VK peer id ranges.

## 2. Automations (`automation/`)

- `automations.js` — `normalizeAutomation` (trigger → audience →
  conditions → action, mode, pacing, limit), the four presets
  (`reengage-dormant`, `job-search`, `contract-search`, `greet-back`),
  and `planAutomation`, which resolves the audience, applies the
  conditions and drafts each message in the detected form, listing who
  was left out and why.
- `drafts.js` — browser-safe draft queue: load, queue, send after
  confirmation (`ConfirmationRequiredError` otherwise), switch form,
  mark as sent by hand, skip; every outcome is an `automation-run:*`
  record.
- `runner.js` — `createAutomationRunner` (safe: queue drafts; auto:
  paced sends with a typing status, a daily cap and random pauses, as in
  konard/vk-bot and hh-job-application-automation) and
  `createAutomationScheduler` (`schedule` and `incoming` triggers).
  A manual or chat-menu run in auto mode needs `confirm: true`.

## 3. People and audiences (`crm/people.js`, `sources/live-links.js`)

- One entry per network account built from messages, `person:`,
  `member:` and `list:` links; explicit `sameAs` links join accounts,
  and `crossReference` suggests (never merges) accounts on different
  networks that share a normalised name or handle.
- Audience specs (`friends:vk & chat:vk:2000000001 - list:blocked`) are
  parsed into union / intersect / difference trees, resolved with a
  count, and saved as `audience:*` links.
- `syncMembership` stores VK friends, chat and community members (and
  the Telegram chat members the Bot API exposes) as `member:` links.

## 4. Replies and autocomplete (`replies/`)

- `reply-graph.js` — prompt → reply pairs from the archive (a partner
  message and our next one within the reply window, or an explicit
  `replyTo`), normalised, deduplicated and counted; the word stage
  learns trigram → bigram → unigram continuations from our own
  messages.
- `reply-service.js` — builds the index at start, learns every new
  message in real time, and answers `/api/suggest`.
- `reply-store-clink.js` — optional mirror into `clink --serve`
  (`MS_REPLY_CLINK=1`), never on the keystroke path.

## 5. Storage (`storage/`)

- `doublets-archive.js` and `binary-packet.js` — the link-cli store
  archive layout and binary links notation packets, cross-checked
  against the `links-notation` package.
- `lino-store.js` — one Links Notation record per line; `clink.js`
  finds the binary, loads an archive and speaks the `--serve` protocol;
  `file-writer.js` coalesces whole-file writes.

## 6. Delivery and typing (`sources/`)

- Adapters gained typing: VK `messages.setActivity` and long-poll typing
  events, Telegram `sendChatAction`, WhatsApp typing indicators.
- `browser-sender.js` — when the API fails or is missing, the official
  web UI (vk.com, web.telegram.org, web.whatsapp.com) is driven with
  browser-commander; a signed-out page is `login-required`.

## 7. Front ends

- CLI: `cli/automation-commands.js` (`meta-sovereign automations …`);
  `reengage-commands.js` was removed.
- HTTP: `server/routes-automations.js`, `routes-people.js`,
  `routes-suggest.js`; `routes-reengage.js` was removed.
- SPA (`reengage-view.js` was removed):
  - `web/chat-view.js`, `chat-state.js`, `chat-model.js` — t3-style
    chat, ⚡ menu, drafts, suggestions, typing;
  - `web/automations-view.js`, `automations-state.js`,
    `automations-model.js` — editor, preview, runs, people, audiences;
  - `web/automation-api.js` — server first, local links offline;
  - `web/appearance.js` — themes and skins.

## 8. Dependencies

- `chore(deps)` updated every npm package and GitHub Action to its
  latest release and fixed what ESLint 10 and jscpd 5 reported.

## 9. Documentation

- `docs/REQUIREMENTS*.md` section X (R-X1 … R-X21),
  `docs/USER-GUIDE*.md` section 11, `docs/SERVER-PARITY*.md` section 5a,
  in en/ru/zh/hi.
- This case study with screenshots, verification logs and raw issue /
  PR data.

## Testing

| Test file                             | What it covers                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `js/tests/address-form.test.js`       | markers, false-positive collisions, owner weighting, tie / no-evidence fallback, zh / hi, user pattern rules |
| `js/tests/reengage.test.js`           | dormant detection, chat kinds, self detection, templates, prefill links                                      |
| `js/tests/automations.test.js`        | normalisation, presets, conditions, safe drafts, auto pacing and caps, scheduler, incoming triggers          |
| `js/tests/automation-cli.test.js`     | list, plan, run, review keys, auto confirm, drafts, history, save and delete                                 |
| `js/tests/automations-server.test.js` | the automation routes, confirm-required, chat-menu runs, failed sends                                        |
| `js/tests/automation-api.test.js`     | SPA calls with and without a server                                                                          |
| `js/tests/automations-view.test.js`   | editor, preview, runs, people search and audiences in every locale                                           |
| `js/tests/people.test.js`             | people index, cross references, search, audience specs and resolution                                        |
| `js/tests/live-links.test.js`         | typing links and membership sync                                                                             |
| `js/tests/reply-graph.test.js`        | pairs, deduplication, frequency order, word stage                                                            |
| `js/tests/reply-service.test.js`      | real-time learning and `/api/suggest`                                                                        |
| `js/tests/reply-store-clink.test.js`  | the link-cli mirror against a fake `clink --serve`                                                           |
| `js/tests/doublets-archive.test.js`   | archive layout and packets against `links-notation`                                                          |
| `js/tests/browser-sender.test.js`     | web UI fallback against a fake browser session                                                               |
| `js/tests/chat-view.test.js`          | chat list, drafts, ⚡ menu, suggestions, typing                                                              |
| `js/tests/appearance.test.js`         | theme modes, skins, Settings → Appearance                                                                    |

## Alternatives Considered

- **A PEG grammar for Russian sentences.** Rejected: the verdict needs
  marker counts, not parse trees, and a grammar would be much harder
  for a user to extend than a table of regexes.
- **Using the contact's messages only.** Rejected: the owner's own
  usage is the best predictor of how the owner should write now, so it
  is weighted higher, but the contact's messages still count when the
  owner never used a marker.
- **Keeping the Re-engage screen next to automations.** Rejected by the
  review ("we don't need separate chat for or screen"); its behaviour is
  the `reengage-dormant` preset, and its drafts live in the chats.
- **Answering every keystroke from link-cli.** Rejected for now: a
  `clink` query scans every link: a lookup took about 1.4 s with 200
  reply pairs on link-cli 1.0.0 (Rust) and about 200 ms with 5000 pairs
  on 4.0.0 (.NET) (`experiments/clink-query-scaling.mjs`). The
  in-memory index answers a keystroke without I/O, and link-cli keeps
  the mirror.
- **Sending through the web UI first.** Rejected: the APIs are faster
  and do not depend on page markup, so the browser is the fallback.
