# VK history and metadata cache

Open Connections → VK → VK history and metadata cache. Enter the connected VK
account ID, peer ID and data kind: history, conversation, friends, profile or
friend count. Friends belong to the selected account and ignore the peer field;
profiles and friend counts require a positive user ID.

Inspect reads saved data without contacting VK. Load or continue reads at most
200 records per page, with 1–50 pages per explicit refresh. Partial history
retains an acknowledged offset. Continue only while the newest provider page
still matches; restart explicitly after history changes. A complete cache
refresh starts a new snapshot. Failed reads or durable writes retain the last
acknowledged cursor. Cache operations never send messages or delete VK data.

The panel shows saved count, provider total, remaining offset and snapshot time.
Expiry is 30 days for history, 14 days for friends, one hour for profiles and
1080 days for friend counts; conversations have no automatic expiry. Expired
data remains available. A saved snapshot does not prove current provider state.
Successful empty results and zero friend counts are also retained.

Export uses saved history, including explicitly partial or expired coverage.
Choose a new absolute folder on the server computer, outside the store; its
parent must exist. Existing paths and symlinks are refused. Linked Markdown and
structured JSON parts preserve oldest-first messages, UTC timestamps, author
links, quoted replies and full native records including media references. Media
is not downloaded. Parts contain at most 1500 lines; oversized text continues
with links to its original record. The final manifest records exact coverage.
Failed exports retain partial files without a success receipt. Retry in a new
folder.

```sh
meta-sovereign vk-cache refresh --account=1 --peer=42 --kind=history --max-pages=1
meta-sovereign vk-cache inspect --account=1 --peer=42 --kind=history --page-offset=0
meta-sovereign vk-cache export --account=1 --peer=42 --folder=/absolute/new-export
```

Add `--restart` to replace a partial snapshot explicitly. Select metadata with
`--kind=conversation|friends|profile|friend-count`, and the store with `--store`.
Same-origin POST endpoints `/api/vk/cache/inspect`, `/refresh` and `/export`
accept text/binary Lino. Offline browser inspection reads local saved data;
refresh and filesystem export require the connected server.
