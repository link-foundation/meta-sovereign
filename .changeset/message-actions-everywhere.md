---
'meta-sovereign': minor
---

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
