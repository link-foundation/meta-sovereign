# External Research

Checked on 2026-10-11. Each item says where the code relies on it.

## `mailto:` with a prefilled body — RFC 6068

https://www.rfc-editor.org/rfc/rfc6068

- Section 2: "The special <hfname> "body" indicates that the associated
  <hfvalue> is the body of the message."
- Section 5: "Also note that line breaks in the body of a message MUST
  be encoded with "%0D%0A"." and "When producing 'mailto' URIs, all
  spaces SHOULD be encoded as %20".

Used by `prefillLinkFor` for e-mail contacts: the draft is converted to
CRLF line breaks and `encodeURIComponent`-encoded (which produces
`%0D%0A` and `%20`), so "Open chat" opens the mail client with the text
already in place.

## Telegram

- Bot API, formatting options
  (https://core.telegram.org/bots/api#formatting-options): "Links
  `tg://user?id=<user_id>` can be used to mention a user by their
  identifier without using a username." The same section notes these
  links are guaranteed to work only inside inline links / buttons and
  subject to the user's privacy settings.
- Deep links (https://core.telegram.org/api/links) document a
  prefilled draft for **usernames** — `t.me/<username>?text=<draft_text>`
  / `tg://resolve?domain=<username>&text=<draft_text>` — and for
  **phone numbers** — `t.me/+<phone_number>?text=<draft_text>`.
  `draft_text` is "UTF-8 text to pre-enter into the text input bar, if
  the user can write in the chat."

Telegram exports identify people by numeric `from_id` (`user123…`), not
by username or phone, so `prefillLinkFor` uses `tg://user?id=` and marks
the link `prefillsText: false`; the screen then offers Copy next to
"Open chat". Whether a desktop/mobile client opens a `tg://user?id=`
link typed outside a bot message depends on the client and the user's
privacy settings; this was not verified on real clients. A username- or
phone-based `?text=` link is the documented improvement once an
importer records usernames (see the case study's Known Limits).

## VK

- `https://vk.com/im?sel=<peer_id>` is the address of a dialog in VK's
  web messenger; it opens the conversation but has no documented
  parameter for prefilled text, so the link is marked
  `prefillsText: false`.
- Peer ids: users are positive ids, multi-user chats are
  `2000000000 + chat_id`, communities are negative. The official
  reference is https://dev.vk.com/en/reference/objects/message; it could
  not be fetched from this environment (the host refused the automated
  fetch), so the ranges were cross-checked against community answers
  that use the same `2000000000 + chat_id` formula, e.g.
  https://qna.habr.com/q/604802 and
  https://www.mintlify.com/negezor/vk-io/api-reference/helpers (vk-io's
  peer helpers). `chatKind` treats `0 < id < 2e9` as personal and
  everything else as a group or community.

## Russian T–V distinction

The rule table follows ordinary Russian grammar: ты/тебя/тебе/тобой and
твой-forms vs. вы/вас/вам/вами and ваш-forms; 2nd-person singular verb
endings `-ешь`/`-ишь` (знаешь, говоришь) vs. plural/polite `-ете`/`-ите`.
The plural ending collides with the prepositional case of many nouns
("в интернете", "на сайте", "в пакете"), so only a
curated list of polite verbs is counted; the collisions are pinned as
tests in `js/tests/address-form.test.js`. "Привет" vs. "Здравствуйте"
are counted as weak (0.5) evidence because people on "вы" sometimes say
"привет" in informal chats.
