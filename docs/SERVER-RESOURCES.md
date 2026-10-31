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
  per-record hash map. Metadata copies skip cold fields before reading values
  and copy directly, avoiding temporary entry arrays and shape churn during
  loading. A native-property-layout experiment did not improve the measured
  live heap and was reverted; object-shape checks are not a heap census.
  Startup adopts its private packed records directly.
  None of these in-memory changes discards messages or changes the disk format.
- A packed raw payload also keeps its media type as a tiny private summary.
  Live poll updates that name only a poll ID, and unsupported-media repairs,
  reject unrelated messages using that summary. They must not inflate every
  message in the archive to find a few matching media items. Public mutable
  copies read their actual payload, so edits cannot leave a stale media type.
  Type names are explicitly copied and shared in a bounded cache. A decoded
  provider name can be a substring of a much larger input chunk: retaining it
  directly would keep that reader allocation alive after its raw data was
  packed. Low-rate production sampling identified this retention path; a small
  synthetic Node fixture checks actual string ownership without using a real
  archive or taking a production heap dump.
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

Retention also reports UTF-16 byte estimates for message bodies, child IDs and
tokens. They count retained string contents, including repeated/shared values,
and exclude object/array overhead. They are attribution bounds rather than an
exact V8 heap census, maintained on writes without scanning the archive.

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

## Repeated conversation analysis

Production request logs on 2026-10-31 showed repeated `people_learned` work on
roughly 3,270 messages, taking about 1.8 seconds after changes. Question grouping
compared each wording against prior groups and re-ran intent/profession regexes,
word tokenization and stemming for every candidate comparison. It now prepares
each distinct wording once in a cache owned by that one bounded analysis. Stem
overlap counts its union without allocating another Set per comparison. The
cache is not global and cannot retain conversations after analysis completes.
Focused checks verify preparation counts and unchanged semantic distinctions.

Frequent composer geometry changes also exhausted the shared client-log rate
budget. Layout traces now coalesce rapid repeated geometry while preserving
following/overlap transitions, so diagnostics do not crowd out actual failures.

These changes address repeated CPU work and allocation churn. They do not by
themselves establish that the large archive's retained metadata heap is small;
continue checking deployed-worker resource counters and retained index costs.

## Analysis request memory spikes

On 2026-10-31 active workers aborted with `SIGABRT` and V8 heap-limit errors.
These were crashes, not upgrade shutdowns. A legacy `/api/facts` request built
an array of every archive record's metadata, including regenerated child/token
arrays, even when no manual patterns existed. Production logs recorded a
seven-second request followed by memory failure. Metrics also requested public
copies of the entire store, detaching packed provider bytes unnecessarily.

Manual fact reads now check patterns first and return immediately when none
exist. Configured patterns use the existing bounded reply-history window (or
an explicitly bounded projection fallback), with up to 100 patterns and 500
facts and reported coverage. Metrics stream IDs and counters instead of copying
archive records. Fact pairing stays within a conversation. A fixture with
throwing raw-payload getters and a forbidden whole-store query checks the safe
paths; no production history is used by tests.

Startup Telegram sender and forward-name repairs had a second whole-archive
path: they queried all Telegram public records, detached their packed buffers,
and inspected raw payloads in a retained array. The repair marker was only
written on completion, so a crash caused the same allocation on every restart.
Repairs now stream small projections; packing retains sparse sender/forward
repair hints. Only changed records are fetched in full. Scans yield through a
background work budget, and repair-start/completion events identify this phase.
Fixtures forbid whole-store query/copy and unrelated raw decoding.

Legacy autocomplete, simple audience/outreach evaluation and fuzzy search now
stream projections too; search retains the best 100 results. Their scans yield
to foreground work. Metrics stream IDs. These remove avoidable peak allocations
without deleting archived content or raising the Node heap limit.
