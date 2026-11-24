# VK sticker catalog

In Connections → VK, open **VK sticker catalog** and enter the connected VK
account ID. **Inspect saved catalog** reads the last acknowledged snapshot
without contacting VK. **Refresh from VK** explicitly reads purchased active
packs, keywords and additional greeting packs. A sticker is usable only when
its pack is purchased and active and VK explicitly allows the sticker.
Saved permission is a snapshot; a later send can still be refused.

Search words or IDs, select a pack or category, and page through 100 results.
The panel lists every usable greeting ID, including multiple greetings from
one pack. Clear **Only usable stickers** to inspect unavailable metadata.
Failed, truncated, oversized, changed-account or inconsistent reads retain
the prior acknowledged catalog. Refresh never sends or purchases anything.

The same catalog appears in Stickers when a VK collection is selected.
Toggle a usable result into the collection, then use its existing **Save**
button. Choices remain manual and survive reload.

**Filter received attachments** accepts the reference's received-attachments
JSON map, or an array of stored attachment records. It keeps positive sticker
and product/pack IDs and lists unique product IDs. Receiving a sticker does
not establish ownership or permission to send it. Filtering works offline.

Export metadata to a new absolute directory on the server computer, outside
the application's store; its parent must already exist. Existing paths are
refused. Bounded JSON parts contain packs, usable stickers, keywords, all usable
greeting IDs, the current filtered selection and optional received/product IDs.
Each part has at most 1500 lines. Preview URLs remain references: artwork files
are not downloaded. A manifest is written only after all parts succeed. If an
export fails, inspect partial files and retry in a new directory.

```sh
meta-sovereign vk-stickers refresh --account=1
meta-sovereign vk-stickers inspect --account=1 --category=greeting
meta-sovereign vk-stickers filter --file=/absolute/received-attachments.json
meta-sovereign vk-stickers export --account=1 --folder=/absolute/new-catalog
```

Optional flags: `--query`, `--pack`, `--category`, `--usable-only=false`,
`--offset`, `--file` and `--store`. Same-origin POST endpoints
`/api/vk/stickers/inspect`, `/refresh`, `/filter` and `/export` accept both
default Lino encodings. Offline inspection uses the local saved snapshot;
refresh and filesystem export require the connected server.
