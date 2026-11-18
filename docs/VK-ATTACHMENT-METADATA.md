# Received VK attachment metadata

Enable **Collect incoming attachment metadata** in Connections → VK → Manual
setup. Collection starts disabled. It keeps the first observed metadata for
each incoming attachment, separately from the message and its media. Turning
collection off preserves saved records. Turning it on collects subsequent
reads; it does not scan earlier stored history automatically. Reimporting an
archive or reading a history page again can collect that page after enabling.

The collection handles archive imports, automatic JSON imports, API/browser
message reads, VK conversation/history pulls, Long Poll, older history and
individual imported message writes. It preserves the existing message import
counts. Collection writes must finish before a pull acknowledges its cursor.
A failed collection write keeps that page available for retry, including
messages already stored by the interrupted attempt.

Records use provider, attachment type, owner and native attachment ID as their
identity. Stickers and gifts can have global IDs. Later copies do not replace
the first metadata or its original message/chat provenance, including after
restart. Outgoing, deleted and service messages are excluded. Attachments
without stable native IDs, including HTML/browser captures that lack them,
are skipped. The collection makes no download or provider mutation requests.
The existing message attachment/media rendering remains available.

Metadata is copied as data, with empty values and credential fields removed.
Each message contributes at most 100 attachments; each collected record is
limited to 512 visited values, eight nesting levels and 32,768 UTF-16 code
units of property names and string values. Oversized records are skipped
whole. Saved metadata displays as literal text. The list reads at most 100
records per page and retains only the requested page plus its next cursor
while scanning the store.

```sh
meta-sovereign vk-attachments --enabled=true --store=/path/to/workspace
meta-sovereign vk-attachments --limit=50 --store=/path/to/workspace
meta-sovereign vk-attachments --after=attachment:vk:photo:41:11 --limit=50 --store=/path/to/workspace
meta-sovereign vk-attachments --enabled=false --store=/path/to/workspace
```

Listing opens the workspace read-only. Changing `enabled` acknowledges the
saved setting before returning success. `GET /api/vk/attachments` accepts
`after` and `limit` query parameters and returns `settings`, `items` and
`next`. `POST /api/vk/attachments` accepts `{ enabled: true|false }` and
requires the trusted app origin policy. Both routes use the default text or
binary Lino protocol; JSON compatibility remains opt-in. The shared UI works
through the connected server or its local browser store when offline. A
failed setting save preserves the last acknowledged checkbox state and the
visible records.

[Reproduction, focused tests and before/after evidence](case-studies/issue-56/vk-attachments.md)
are tracked in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
