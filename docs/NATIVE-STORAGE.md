# Native server storage

`meta-sovereign-rs serve` stores acknowledged writes in
`.meta-sovereign/native` under its working directory. Select another native
directory with `--data <dir>` or `MS_NATIVE_DATA_DIR`. Use `--memory` explicitly
for disposable runs. The JavaScript server has a separate database format;
do not point the native server at its storage directory.

Each native write prepares complete text Links Notation (`.lino`) and binary
Links Notation (`.bin`) checkpoints. Both contain the same rich records,
including causal assignment/deletion metadata and private local records.
JSON compatibility stays disabled by default. The `CURRENT` file selects the
committed generation; files from later interrupted writes are never read as
committed data. The last two committed pairs remain as local recovery dumps.
These files are plaintext; native encrypted exports and scheduled backups
remain unavailable.

Only one writer may open a directory. An operating-system file lock releases
when the process exits. Checked HTTP writes wait for both files to be flushed
and the commit pointer to be replaced before success. Storage failures return
HTTP 503 with `NATIVE_STORAGE_UNAVAILABLE`; malformed input returns HTTP 400.
A failed batch does not partially change memory. If publication has an
uncertain result, further writes require reopening the server.

Opening validates the current pair with the official codecs and a 64 MiB
limit per copy. One unreadable or corrupt copy can be rebuilt from the other
valid copy. Different valid copies, an unsupported schema, two bad copies, or
a missing pointer in a nonempty directory stop startup and preserve the
committed files for recovery. An interrupted first initialization with no
pointer also needs explicit recovery; it is never silently reset. Preserve the
entire directory before manual recovery and inspect the preceding pair.

The implementation flushes files on supported operating systems and directory
entries on Unix. It does not claim identical power-loss guarantees for every
filesystem or Windows. It writes complete checkpoints, so its cost grows with
stored data; it is not an incremental log or an unlimited database. Native
WebSocket schema admission, durable acknowledgements and offline reconciliation
remain unfinished. The [server parity matrix](SERVER-PARITY.md) lists remaining
provider and product differences.

Programmatic `ServerOptions::default()` uses memory for isolated fixtures.
Set `data_dir: Some(path)` to open durable storage. `ServerState::open(path)`
provides the same backend directly. `MS_NATIVE_STORAGE_DEBUG=1` enables
content-free initialization/repair counts and failed-write error kinds.
