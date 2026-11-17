# Runtime checkout excludes archived evidence

At source `06953e31`, [macOS Node partition 3/8](https://github.com/link-foundation/meta-sovereign/actions/runs/44093457474/job/134077328521)
is cancelled at the ten-minute job limit. The preserved raw log records checkout
from 14:09:14 to 14:11:41, dependency installation finishing at 14:15:24, and
tests cancelled at 14:19:19 (line 1497). No assertion failure precedes cancellation.
The final worker is still importing. Setup consumed over six minutes; another
blind test partition or a larger deadline would not address that setup cost.

The existing `blob:none` filter skips old blobs but still materializes the full
current tree. At this revision, `dev/log`, `docs/screenshots` and
`docs/case-studies/issue-56/data` contain 1,250,380,088 tracked bytes (1,192.5 MiB).
The runtime jobs do not consume those archived files. Reviewed CI fixture tests
create their own similarly named paths in disposable repositories; documentation
tests do read other case-study Markdown, which remains included.

Only the runtime job now adds non-cone sparse patterns excluding those three
directories. It retains all maintained source, actual test fixtures, local
composite actions, Markdown and the full commit DAG. Other jobs retain their
existing checkout. The ten-minute limit, every runtime/OS partition and every
test remain required. Archived files remain tracked and available through Git.

The official [checkout source](https://github.com/actions/checkout/blob/v7.0.1/src/git-source-provider.ts)
applies its explicit fetch filter and then configures sparse checkout before
checking out the ref. Its [non-cone implementation](https://github.com/actions/checkout/blob/v7.0.1/src/git-command-manager.ts)
writes the patterns after enabling `core.sparseCheckout`. The bounded integration
fixture follows that sequence, rather than assuming the two inputs conflict.
It verifies the initial checkout leaves archive blobs unfetched. A stronger
experimental assertion after a merge failed: Git can fetch an excluded changed
blob while merging. Preserve that result; sparse checkout does not promise
that every future merge avoids every archive transfer. It does keep those
files absent from the worktree after the merge.

The existing checkout regression fails against the actual published workflow
and passes with the new settings. A finite file-server Git fixture verifies
that required runtime/documentation files exist, all three archived paths stay
absent, the complete DAG remains, a newer base changes both an included source
and excluded archive, and the fresh-base merge preserves those properties.
`git show` retrieves the exact changed archive bytes without adding a worktree
file. Old historical bytes remain available on demand. Both focused checks
pass under Node and Deno; no local full suite or runtime matrix is run.

```sh
python -B experiments/issue-56/ci-sparse-before.py
node --test --test-concurrency=1 js/tests/ci-filtered-checkout.test.js
deno test --allow-all js/tests/ci-filtered-checkout.test.js
```

The [checked archive](data/ci-runtime-evidence-checkout.tar.gz) preserves the
cancelled raw job, timing metadata, size inventory, input-consumer review,
official action source, actual-parent failure and focused results. Hosted
completion is still required. This repair does not accept an original issue
criterion; all forty unfinished criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
