# Native checkpoint admission

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), issue #56.

Published `0f245481b247bdbbf622127deecd97fd095ddb8e` stamps native
owner writes but only keeps them in memory. The unchanged command
`meta-sovereign-rs serve --port 0`, run from an isolated temporary directory,
can acknowledge a rich binary-Lino write and lose it after process termination.
The shared `native-durable-interop.mjs` regression starts that command, stores
one record, stops its owned process, restarts it and checks the exact admitted
payload and clock. Hosted CI builds the exact parent and requires its missing
record assertion to fail before rebuilding the corrected native binary. The
full codec/network build is deliberately not repeated on this limited host.

The draft adds `ServerState::open`, optional `ServerOptions::data_dir`, a CLI
default native directory and explicit `--data`/`--memory` choices. Native
checkpoints have their own format-1/schema-13 envelope; they do not claim to
open JavaScript database files. All checked owner, remote and batch admission
prepares one complete candidate checkpoint before changing either rich state
or the typed mirror. Restore does not invent historical clocks. A fresh writer
actor is still assigned to each writable opening. Private/schema records stay
local; raw public replication retains payload-free deletion clocks.

The actual checkpoint implementation writes and flushes immutable text and
binary generation files, flushes directory entries on Unix, and publishes one
`CURRENT` pointer. It retains the previous pair as a recovery dump and holds an
exclusive operating-system file lock for its lifetime. Unpublished files are
ignored during reads and known later generation files are cleaned on reopen.
Staging refusal removes only files created by that attempt. A failure after
pointer replacement freezes further writes until reopen, avoiding a later
stale-memory overwrite. HTTP responses use 503 for unavailable storage and
400 for invalid records, including email batch admission. Startup failures
retain their useful filesystem/validation explanation.

The official text and binary wire codecs validate both bounded current copies.
One bad copy is repaired through a newly committed pair. Different valid
records, duplicate IDs, future schema, two bad copies and an absent pointer
in a nonempty directory are refused. There is no automatic older-generation
rollback or silent empty reset. Files are plaintext and complete snapshots;
per-copy size is bounded at 64 MiB. Windows has file flushing but this standard
library implementation does not claim Unix directory-fsync guarantees there.
See [native storage](../../NATIVE-STORAGE.md) for operation and recovery limits.

Local focused validation compiles the actual std-only state, register, core,
route dispatcher and checkpoint implementation without building the large
wire dependency. Six filesystem checks exercise nested private creation,
writer exclusion, bounded
reads, retained generations, staging failure, preserved preexisting files,
orphan cleanup, pointer exhaustion and uncertain publication. Three admission
checks inject backend failure and verify whole-batch refusal, no false HTTP
success, private deletion, preserved clocks and validation errors. These
checks do not substitute a mock codec for the official durable integration
tests. Actual rich reopen, one-copy repair, future-schema refusal, stale remote
packets, fresh opening actors, physical checkpoint failure and native HTTP
restart run in the existing hosted Rust job. Native fixture servers explicitly
use `--memory` or an isolated owned temporary directory.

All nine focused checks pass; the ten existing owner-route cases and nine
rich-record/number cases also pass. Scoped Clippy rejects warnings and peaks
at 233,108 KiB child RSS; the focused compiler peaks at 202,680 KiB. The
unchanged 6.5% duplication gate passes (42,238 of 651,999 lines, 6.48%)
without threshold or exclusion changes. The [checksummed evidence](data/native-durable-storage.tar.gz)
and [hash manifest](data/native-durable-storage.tar.sha256.json) retain sources,
logs, resource data and the complete preceding hosted disclosure-failure
workflow. The exact-parent CLI failure and actual corrected codec/network
checks are registered on hosted CI and have not been run on this limited host.
Exact-head hosted verification remains required. Native schema-gated transport, durable network acknowledgements,
initial/offline reconciliation, automatic live tab merging and the remaining
original requirements are unfinished. PR #57 remains draft and unmerged.

Hosted follow-up on `25637f4f`: the official codec build, Clippy, all six
filesystem tests and two of three durable integration cases pass. The remaining
case fails at [Rust job 132137416165](https://github.com/link-foundation/meta-sovereign/actions/runs/43497852404/job/132137416165),
full log lines 676–679: replaying an older deletion contributes its retained
child `c` to a recreated record. The body and all three causal counters remain
exactly the recreated values. The test had incorrectly expected the pre-merge
absence of `children` to survive a grow-only child-set merge.

`native-recreated-children.mjs` independently exercises actual JavaScript owner
admission, private raw deletion storage, a fresh writable opening and the
production peer receiver. It confirms this child union while preserving the
new payload. A new JavaScript-generated shared fixture verifies native merge
permutations too. The durable assertion now explicitly expects the retained
child and the complete unchanged recreated payload/clock, including after
another durable opening. No production merge behavior is changed. The focused
reference test and nine native rich/number checks pass. Hosted durable restart
and network verification must rerun after the assertion correction. The
[follow-up evidence](data/native-recreated-children.tar.gz) and
[manifest](data/native-recreated-children.tar.sha256.json) preserve the full
725-line failed Rust job, exact-head metadata, source snapshots and reference
logs.

Hosted follow-up: all three actual official-codec durable integration tests
pass on `9db8d8d9`; after isolating the parent executable, corrected
`3ad29517` also passes the real CLI restart/corruption/refused-write probe and
HTTP/mixed signaling interoperability in
[Rust job 132152543260](https://github.com/link-foundation/meta-sovereign/actions/runs/43501736882/job/132152543260).
The expected exact-parent restart loss is still verified. See the
[artifact correction](ci-native-reference-artifact.md) and
[next native sync unit](native-sync-session.md), whose evidence retains the
full positive logs. This verifies native checkpoint admission and restart;
every remaining replication and product criterion stays independently open.
