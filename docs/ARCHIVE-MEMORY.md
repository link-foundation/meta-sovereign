# Archive memory

The text log is the durable source of truth. Message metadata stays indexed in
memory; cold `raw` provider payloads and message-version `snapshot` objects are
serialized and compressed in a disposable positional-read file cache. The cache
has one 64 KB write buffer, reuses released slots, and never caches decoded
payloads. A returned record owns its payload bytes independently, so later
replacement, deletion, cache reuse or store shutdown cannot corrupt it.

Cache files belong to the application folder. On Unix they are unlinked while
open, so the OS removes them on process exit or crash. Other platforms remove
them on close. Rolling workers use separate files. The durable archive and its
format do not change; this cache is rebuilt from the log and is not a backup.

`/api/health` reports the main isolate's heap, external allocations, retained
payload bytes and `retention.payloadCache` (file span, resident write buffer,
entry count). `packedBytes` is serialized content size; `allocatedBytes` counts
retained payload buffers, excluding the shared write buffer reported separately.
Heap figures do not include a snapshot worker's isolate. On macOS RSS omits
compressed/swapped memory; compare the process's physical footprint as well.

Large archives still require memory for message metadata and indexes. Binary
snapshots also build an associative network in a paced worker, so snapshot
working memory can exceed the idle baseline. Do not infer whole-process memory
from the main heap alone. Profile changes with focused synthetic fixtures;
large archive and memory regression checks belong in GitHub CI, not on a user's
machine.
