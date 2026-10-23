# Data migrations: a versioned data schema (languages: en • [zh](DATA-MIGRATIONS.zh.md) • [hi](DATA-MIGRATIONS.hi.md) • [ru](DATA-MIGRATIONS.ru.md))

When the shape of stored data changes (a field renamed, an id computed another way, a date kept as ISO text), the data already on disk has to follow. meta-sovereign keeps a **schema version** with the data and runs **migrations** in order, automatically, when the data is opened for writing (R-Z17).

## How versions work

- The version is one link in the store, `meta:schema`: `{ version, applied: [{ id, at, ms, changed }], app }`. `applied` is the history (which migration, when, how long, how many links it changed); `app` is the app version that wrote it.
- A store without that link is **version 0**: the shapes before versions existed. An empty store counts as current.
- `CURRENT_SCHEMA` (in `js/src/storage/migrations/index.js`) is the version this build writes. Each migration is a module `js/src/storage/migrations/<NNNN>-<slug>.js` that takes the data from version `NNNN-1` to `NNNN`.
- The same modules run on the **server store** (`data.lino`), on **restored backups** and on the **browser store** of the web page / GitHub Pages mode.

## What you see

| Where                                                   | What happens                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta-sovereign serve`, or any command that writes      | If the store is older, it is migrated first (the server listens only afterwards). The log shows `migration_started`, one `migration_step` per migration (`id`, `scanned`, `changed`, `ms`; counts only, never content), then `migration_done`. |
| `meta-sovereign migrate --store=<dir>`                  | Migrates now and prints the same lines.                                                                                                                                                                                                        |
| `meta-sovereign migrate --store=<dir> --dry-run`        | Counts what each migration would change; writes nothing, takes no lock.                                                                                                                                                                        |
| `meta-sovereign migrate --store=<dir> --status`         | The store's version, how many migrations are pending, and the history.                                                                                                                                                                         |
| `/api/health`                                           | `schema: { version, current }`.                                                                                                                                                                                                                |
| Read-only commands (`export`, `backup`, `cv-read`, ...) | Never migrate. An older store is read as it is (one `schema_old_read_only` line says so); readers accept old shapes.                                                                                                                           |
| Backups                                                 | The archive records `schema: { version }`. Restoring an older archive migrates its links in memory first, so a failure writes nothing; restoring a newer one is refused with `BACKUP_TOO_NEW`.                                                 |
| Peer sync (`/ws`, `sync-connect`, WebRTC)               | Peers exchange their schema version. If the numbers differ, nothing is exchanged and both sides log `SCHEMA_MISMATCH` naming both versions; the older side must update the app.                                                                |

### A store from a newer version: `STORE_TOO_NEW`

If the store was written by a newer app (its version is above `CURRENT_SCHEMA`), the app **never writes to it**: the server stays down and the command stops with "this store was written by a newer version; update the app". Read-only opens are refused too, because they could misread data. Update the app (or open the store with the app that wrote it).

### Not enough disk: `LOW_DISK`

A migration only appends to the log, but it needs room. Before starting, the free space must be at least 10% of `data.lino` plus 256 MB; otherwise nothing is changed and the app says how much is needed and how much is free. Free some space and start again.

## Rollback: how a failed migration is undone without copying the store

`data.lino` is append-only, so a migration is undone by cutting it back:

1. Before the first migration, the log is flushed and its byte length is written to `migration.json` (durably).
2. During the migration compaction is held (the log is only appended to) and the binary snapshot `data.bin` is not written.
3. After each migration finishes, its `meta:schema` link is appended and `migration.json` moves forward to the new length. A stop between two migrations keeps the first.
4. At the end `migration.json` is deleted.
5. If a migration throws, or the process dies and the next open finds `migration.json`: `data.lino` is truncated to the recorded length (fsync), `data.bin` is deleted (it is rebuilt from the log) and the journal is removed (`migration_rolled_back`). The same open then tries again. If it fails again the app reports `MIGRATION_FAILED` with the migration's id and the store is as it was.

No second copy of the store is made, and memory stays at what the store already holds (migrations see links in batches of 1000 copies).

The **browser store** is a snapshot saved as a whole, so it has no log to cut back: its migrations are idempotent, `meta:schema` is saved after each one, and a tab closed half way runs that migration again and gets the same result. A browser store from a newer build is left untouched (the page works on a scratch copy and fires an `ms-schema-too-new` event).

## Writing a migration

Checklist:

1. **Module** `js/src/storage/migrations/<NNNN>-<slug>.js` exporting `id` (the file name without `.js`), `from` (`NNNN-1`), `to` (`NNNN`), `description` and `async up(ctx)`. Add its import and entry to `MIGRATIONS` in `index.js` and raise `CURRENT_SCHEMA` to `to`. No `node:` imports, no network: it is a pure data transform and must run in the browser too.
2. **Idempotent and forward-only.** Running `up` again after a crash must give the same result: compute the target shape from the stored fields and write only what differs (`ctx.putMany` skips links that are already equal and counts only real changes).
3. **Fixture test with an old-shape store**: build links the way the previous release stored them (see `js/tests/migrations-email.test.js`; best derived from what the current code writes), migrate, and compare with what the current code would store.
4. **Idempotency test**: run it twice (`runMigrations(store, { migrations, from: <old> })`); the second run changes 0.
5. **Dry-run count**: the same fixture through `migrate --dry-run` (or `runMigrations(..., { dryRun: true })`) reports the number of changed links and writes nothing.
6. **Docs row**: add a row to the table below, and mention what could not be recomputed from stored data (and that old records stay readable).
7. Reading code keeps accepting the old shape until the migration has shipped for a while (a read-only open does not migrate).

`ctx` gives you:

- `ctx.scan({ prefix, where, batchSize }, async (batch) => ...)`: copies of matching links in batches; `ctx.get(id)`.
- `ctx.putMany(links)` / `ctx.put(link)`: write changed links; `ctx.tombstone(id)`: delete one.
- `ctx.rekey(oldId, newId, { patch })`: write the link under the new id, keep an `alias:<oldId>` link pointing at it, tombstone the old id. A different link already under `newId` is never overwritten (counted in `ctx.stats.conflicts`). `ctx.rekeyMany(pairs, { fields, children, refMap })` does it for many pairs and then, in one pass, points the `children` entries, the listed scalar `fields` (e.g. `replyTo`) and anything `refMap(text)` maps (ids embedded in longer ones) at the new ids. `ctx.resolve(id)` follows aliases, so a reply, reaction or chat membership that still names the old id resolves.
- `ctx.log(name, counts)`: a log line with numbers only; `ctx.progress({ scanned, changed })`; `ctx.dryRun`.

## Migrations

| Id                         | Schema | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001-email-threads`       | 0 -> 1 | Email read from raw RFC 822 (IMAP, POP3, `.eml`, `.mbox`) gets the conversation key R-Z5 uses (first id of `References`, else `In-Reply-To`, else its own `Message-ID`, else the base subject), its parent, `messageId` / `references` / `inReplyTo`, and `timestamp` as ISO time; all email gets the ISO time. Recomputed from the stored `rawHeaders` and `subject`. Not recoverable from stored data: the decoded form of an encoded-word subject, and the id of a mail that had no Message-ID; those stay as they are and remain readable.                                                                                                                                                                                                                                                        |
| `0002-whatsapp-chat-ids`   | 1 -> 2 | WhatsApp chats get the stable id R-Z9 uses: the E.164 number, the group JID, the linked-id JID, or `name:<hash>` for an export of a saved contact. Recomputed from the stored `chat`, `chatName` and `via`; a page-read message moves to `msg:whatsapp:<new chat>:<key>` (the old id stays resolvable through `alias:`), and `chat`, tokens and `chat:whatsapp:<id>` references follow. Not recoverable from stored data: a chat read by its page title (no number was stored), an export chat that was `unknown` without a name, the real message id of a group message stored under the participant JID, and the counter ids of old exports; those keep their ids (their chat is still updated where it can be computed) and stay readable. Counted in the log line `whatsapp_chat_ids_unresolved`. |
| `0003-vk-reactions-docs`   | 2 -> 3 | VK reactions are stored as the emoji with the number kept as `reactionId` (they were the bare number), and VK image / gif documents stored as `file` get the kind `photo` / `gif` and their `ext`. Recomputed from the stored `reactions` and the kept `raw` message; a reaction VK has no emoji for stays a number, and a message stored without `raw` keeps its attachments. Message ids, chat ids, senders and times did not change (no ids move). Counted in the log line `vk_reactions_docs`.                                                                                                                                                                                                                                                                                                    |
| `0004-github-external-ids` | 3 -> 4 | GitHub items gain `externalId` (`kind`, REST `id`, `nodeId`, `owner`, `repo`, `number`) and `messageId`, backfilled only from stored fields: kind and numbers from the link id, repository from `raw.url` (or the link id), REST and node ids from `raw`, a comment's issue number from its chat. Items where the repository or object cannot be worked out stay unchanged and keep refusing edit / delete / react with `no-external-id`; their count is in the log line `github_external_ids` (`unresolved`). Nothing is fetched; no ids move.                                                                                                                                                                                                                                                       |

### Shape changes announced by other work (each adds its migration with this contract)

| Change                                                                        | Fit                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R-Z7: tombstones unified to `deleted: { at, by, reason }`                     | A scan of links with `deleted: true` or `deletedAt`; `ctx.putMany`.                                     |
| R-Z10: Facebook / LinkedIn message ids; Facebook `timestamp_ms` number to ISO | Ids with `ctx.rekeyMany` (aliases keep replies and reactions resolving); times with `scan` + `putMany`. |
| R-Z9: WhatsApp chat ids from title-based to stable                            | `ctx.rekeyMany` with `fields: ['chat']` and a `refMap` for `chat:whatsapp:<id>` children.               |
| R-Z11: GitHub items gain `externalId`                                         | `scan` + `putMany`, backfilled from the stored URL / ids when possible.                                 |

## Telegram's `SCHEMA_REV` is a different thing

`SCHEMA_REV` in `telegram-layer.js` says which Telegram API layer a chat was last read with; `telegram-repair.js` re-reads chats from the network when it changes. A migration must not use the network, so that stays separate: a migration reshapes what is stored; the repair re-asks Telegram for what a newer layer can tell.
