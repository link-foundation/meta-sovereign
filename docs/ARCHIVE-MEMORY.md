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
`backgroundSnapshots` reports each snapshot worker's engine, phase and latest
memory counters separately. Main heap figures exclude worker isolates. On macOS RSS omits
compressed/swapped memory; compare the process's physical footprint as well.

Large archives still require memory for message metadata and indexes. Binary
snapshots use a temporary SQLite workspace for the associative network,
deduplication and live-record positions, with a 16 MiB page-cache target and
bounded lookup caches. The worker has a 512 MiB heap limit; file buffering is
bounded separately, and names stream without arrays per character. The output
is the same link-cli binary archive. The workspace is removed on completion or
cancellation; later runs reclaim crash leftovers only when their owner is gone.
Record processing yields frequently to keep background CPU use low.

This path uses the runtime's built-in SQLite (Node with `node:sqlite`, modern
Deno, or `bun:sqlite`). Older runtimes without it retain the compatible in-memory
snapshot encoder and can require substantially more memory; diagnostics report
`engine: memory` for that fallback. Current Node 24 uses the disk path by default.
Do not infer whole-process memory from the main heap alone. Profile changes with focused synthetic fixtures;
large archive and memory regression checks belong in GitHub CI, not on a user's
machine.

Rolling workers record `server_resources` every 30 seconds using process
counters, with PID, build, upgrade phase, interval CPU percentage, RSS and peak
RSS, heap usage/limit, external buffers, event-loop utilization and background
snapshot memory. Sustained CPU pressure or high memory emits
`server_resource_high`; returning below the thresholds emits
`server_resource_recovered`. Warm-up, ready, active and standby transitions are
recorded separately. These diagnostics do not scan the archive, take heap dumps
or keep a retiring worker alive. They use the existing rotated server log;
diagnostics attached to an already running process may use `logs/resources.log`.

A rolling upgrade temporarily has two archive indexes in different processes.
Use PID and phase to distinguish that overlap from growth in one active worker.
Once the replacement is active, its predecessor is retired. Explicit chat
automation tests plan from lightweight summaries and only the requested chats'
text; a repeated test with an existing pending preview does not scan history at
all. This avoids detaching every packed provider payload into a second full
archive copy just to prepare a draft.
