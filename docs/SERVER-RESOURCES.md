# Server CPU and memory

An archive is durable data; autocomplete, indexes and binary snapshots are
derived views. Their working memory must not expand into additional decoded
copies of the whole archive.

## Failure addressed

A production Node process with a roughly 2.1 GiB text log reached its default
4 GiB heap limit. Its log contained repeated major collections around 4,000 MiB,
then `Allocation failed - JavaScript heap out of memory` and worker recovery.
High CPU during that period included garbage collection. RSS can exceed the
JavaScript heap because buffers and a snapshot worker have separate allocations.
A fall in RSS alone does not establish that a leak has disappeared.

## Retention and background work

- The file-backed text store retains large `raw` and `snapshot` objects as
  serialized bytes, with fast compression when beneficial. Each buffer owns its
  exact backing allocation; a tiny compressed result cannot pin a large slab.
  Reads deserialize on demand; retained store records never cache decoded payloads. Replacement and
  deletion release the previous record. These bytes are private in-memory data,
  not a new disk format. The text log and binary archive remain compatible.
  Query copies also keep payloads deferred: reading metadata or filtering a
  returned record never expands its provider data unless that field is used.
  A public read copy materializes a field on first use, preserving normal
  assignment and nested mutation on that copy without changing the store.
- Packed records keep cold-field references in two fixed slots instead of a
  per-record hash map. Metadata copies use native object construction, retaining
  compact V8 property slots for wide records instead of property hash tables.
  Copies skip cold fields before reading values. These changes reduce retained
  bookkeeping without adding compression work, discarding messages or changing
  the on-disk format. Startup adopts its private packed records directly.
- A packed raw payload also keeps its media type as a tiny private summary.
  Live poll updates that name only a poll ID, and unsupported-media repairs,
  reject unrelated messages using that summary. They must not inflate every
  message in the archive to find a few matching media items. Public mutable
  copies read their actual payload, so edits cannot leave a stale media type.
- Forum topic IDs are summarized while packing too. Chat-index startup projects
  only its small metadata fields and the summarized topic; it does not create
  full public record copies or inflate every provider payload to read reply
  headers. Existing forum routing, deleted entries and edit counts are retained.
- Startup deduplicates metadata strings in a bounded 50,000-string rolling
  window. Unique IDs, including superseded/deleted records, cannot grow that
  temporary cache with the whole log. Cold payloads bypass the cache entirely.
  Compaction writes batches instead of expanding all cold
  payloads before writing. Status/contact aggregation and reply bootstrap scan
  metadata without decoding provider payloads. Other derived routes omit cold
  payloads from their working copies.
- The reply service keeps separate recent windows for our messages and other
  senders: at most 12,500 messages and 8 MiB of estimated input per window. Bodies
  over 4,096 characters are excluded from learning. Backfill order does not
  displace newer messages. Each context map is limited to 8,192 conversations
  and 8 MiB of estimated input. The graph rebuilds from this bounded window
  after edits, deletions or 512 new learned messages, removing obsolete entries.
  Closing the service clears these caches. These limits affect suggestions,
  never the stored conversations or their edit history.
  Conversations outside the window load their compact context on demand.
- Binary snapshots stream the existing packet format in 64 KiB chunks, avoiding
  multiple archive-sized output buffers. Their background worker yields after
  an 8 ms work slice, resting 24 ms between slices. Checks happen at batch/chunk
  boundaries, so this is cooperative pacing, not a hard CPU percentage cap.
  Network encoding still requires working memory proportional to its distinct
  links and names. Only one snapshot runs at a time, with the existing adaptive
  interval and retry backoff. Logs larger than 64 MiB defer the initial automatic
  snapshot by one minute so a retiring rolling worker can leave first. Explicit
  flushes remain immediate and durable.

## Diagnostics

`GET /api/health` includes `memory`: RSS, heap used/total/limit, external and
array-buffer bytes, and `retention` counters for packed file-store records.
`packedBytes` and `allocatedBytes` should agree; `decodedPayloadsCached` is zero.
Counters describe live retained records, not total allocation churn or a full
heap census. The health probe does not scan the archive, build autocomplete,
force collection or take a heap dump.

`telegram_backfill_memory_full` records memory measurements when history
downloads pause at the existing heap threshold. `store_snapshot_written` records
snapshot duration and output size. RSS includes all worker threads; heap figures
describe the responding main thread.

Focused regression tests cover payload replacement/deletion, compaction/reopen,
projected scans, bounded suggestion input/context, packet compatibility and
snapshot scheduling. Run only the affected tests locally with concurrency one;
full suites and runtime/browser matrices belong in GitHub CI. Retention bounds
and a stable observation period reduce risk, but do not prove the absence of
every possible memory leak.
