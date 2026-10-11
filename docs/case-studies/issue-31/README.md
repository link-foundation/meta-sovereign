# Issue 31 Case Study: re-engaging personal contacts after a long silence

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

The implemented solution adds three layers on top of the message links
the archive importers already produce:

1. `js/src/crm/address-form.js` — a data-driven table of word-level
   regex rules (Russian ты/вы plus Chinese 你/您 and Hindi तुम/आप) and an
   explainable `detectAddressForm()` that reports the winning form, the
   reason (`majority`, `tie`, `no-evidence`), a confidence and which
   rules fired. Users can add rules as `pattern:*` links labelled
   `address:informal` / `address:formal`.
2. `js/src/crm/reengage.js` — finds 1:1 chats with a silence of at
   least N days (90 by default, groups, channels and bots excluded),
   picks the template for the detected form, and drives a session that
   in **safe mode (the default)** can only send the current draft after
   an explicit `confirm()`. Every decision is stored as a
   `reengage:<source>:<chat>` link, so a contact is not offered again
   until the threshold passes once more.
3. Three front ends over the same core: the `reengage` CLI command
   (preview, `--interactive` one-by-one, `--mode=batch --confirm=true`),
   the `/api/reengage/{plan,send,mark,run}` HTTP routes, and a
   **Re-engage** screen in the SPA.

## Local Artifacts

Raw GitHub data is preserved under `data/`:

- `issue-31.json` and `issue-31-comments.json` (no comments were posted)
- `pr-34.json`, `pr-34-conversation-comments.json`,
  `pr-34-review-comments.json` and `pr-34-reviews.json` (all empty —
  the PR received no feedback during implementation)

Verification screenshots are preserved under `screenshots/`. They were
taken with Playwright against `experiments/reengage-spa-server.mjs`,
which seeds a store with four dialogs (Telegram "Аня" on "ты", VK 2002
on "вы", an e-mail contact on "ты" whose sender always fails, and a
recent VK chat that must not be offered) and replaces the adapters with
a fake sender:

- `reengage-safe-mode.png` — first open: 3 contacts silent for ≥ 90
  days, draft 1/3 to Аня with the informal text, the evidence line and
  safe mode on.
- `reengage-formal-after-send.png` — after **Send**: "Sent." and the
  next draft (VK 2002) prefilled with the formal text.
- `reengage-send-failed.png` — the e-mail sender throws; the error is
  shown as an alert and the draft stays current so it can be edited,
  sent by hand or skipped.
- `reengage-batch-mode.png` — safe mode switched off: **Send all (1)**
  appears; it still asks for one confirmation before sending.

`experiments/reengage-cli-roundtrip.mjs` drives the CLI in interactive
mode with scripted answers (`y`, `f`, `m`, `s`, `q`) against a temporary
store and prints the resulting `reengage:*` records.

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

**What does "safe mode" guarantee?** In safe mode a session has no way
to send anything but the current draft, and only through `confirm()`;
`sendAll()` throws `SafeModeError`. The HTTP API refuses `/send`
without `confirm: true` and `/run` without `mode: "batch"` and
`confirm: true`. The SPA starts with safe mode on, and switching it off
still asks once before sending the rest. A failed send never advances
the session.

**What if the app cannot send through a network?** Each draft carries
an "Open chat" link where the platform documents one (`mailto:` with the
body prefilled, `tg://user?id=`, `https://vk.com/im?sel=`) and a Copy
button; **I sent it myself** records the manual send, so the contact is
handled either way.

## Requirements

See [`requirements.md`](./requirements.md) for the full mapping of the
issue text to R-X1 … R-X11 and to the tests that cover them. The same
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
- Sending from the app uses each adapter's `live.post`. A network
  without a live sender produces a clear error and the manual path.
