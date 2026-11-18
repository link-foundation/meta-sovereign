# Keep cold macOS Node runs within the existing deadline

Checks run `43698852538` on published `07d3159e` marks native macOS Node
shard 1/4, job `132766442225`, cancelled. The explicit annotation says the
ten-minute job deadline was exceeded. The complete 2,918-line log ends with
1,672 passing tests, five platform-specific skips and zero failures at lines
2887–2897. Test execution took 312,130 ms. Provisioning, checkout, Node/npm and
dependencies had already consumed approximately 4 minutes 40 seconds. All
cleanup steps report success, but the whole job still reached its deadline.
Passing assertions do not establish a passing hosted job.

Eight native macOS Node partitions reduce the remaining test work per runner
without changing the ten-minute limit, per-test deadlines, source discovery,
concurrency two, Intel runner pool or mandatory release gate. Windows Node
retains three partitions and all nine runtime/OS targets remain covered.
No full platform suite runs locally. The updated matrix contract fails against
the actual four-partition configuration. Its finite six-file native probe checks
exact-once coverage and failure propagation, including partitions with no matching
fixture. The focused CI contracts pass 23 Node checks with one Deno-only skip.

The [archive](data/ci-macos-node-eight.tar.gz) and
[manifest](data/ci-macos-node-eight.tar.sha256.json) preserve source, parent,
complete hosted logs, timing metadata, explicit deadline and focused results.
Every product acceptance criterion still requires its own passing exact-head
hosted verification. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
