# Retain the runtime deadline while avoiding unused history blobs

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains a draft.
This change addresses a current-head CI cancellation; all 60 unchecked inventory
criteria and exact-head hosted verification remain required.

Run 43752266837 tested commit `3659e48941ef520bcc06298a15c05bbbf3a1b80b`,
created 2026-11-15 19:24:40 UTC. Its macOS Node shard 2/8 reached the ten-minute
job deadline. The complete job log, preserved in the archive below, shows
checkout taking 2 minutes 20 seconds. Tests began 6 minutes 27 seconds after job
startup (line 481), leaving only 3 minutes 40 seconds for the shard. Tests were
still passing when the runner cancelled them (line 1590). No failed assertion
precedes that cancellation. Cold setup consumed the budget; this evidence does
not establish a test deadlock or a passing cancelled shard.

The runtime test checkout now requests `filter: blob:none` and retains
`fetch-depth: 0`. The pinned checkout action documents both inputs. Git retains
the entire commit graph and obtains the checked-out tree's blobs on demand,
without fetching every historical screenshot and evidence bundle. Fresh-base
merge simulation, the ten-minute deadline, every runtime/OS shard, failure
propagation and the complete test registry remain in place.

The configuration regression fails against the parent workflow because the
filter is absent. A finite fixture creates eight 64 KiB historical blobs, clones
with the actual filter, compares the full commit count and merge base, runs the
repository's fresh-base merge script and verifies both branches' files. At
least seven old blobs remain absent after the merge; reading a historical file
then lazily fetches its exact bytes. The fixture removes its temporary directory
and never opens an application store.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 \
  js/tests/ci-filtered-checkout.test.js js/tests/ci-node-shards.test.js
bun test js/tests/ci-filtered-checkout.test.js
DENO_JOBS=1 deno test --allow-all js/tests/ci-filtered-checkout.test.js
```

Four focused Node checks and two checks each under Bun and Deno pass. The
existing shard checks use six tiny fixture files, including a deliberately
failing case; no full local runtime matrix runs. Formatting, lint and diff
checks pass. Hosted acceptance remains pending for the resulting commit.

The [archive](data/ci-checkout.tar.gz) and
[manifest](data/ci-checkout.tar.sha256.json) retain exact-parent workflow bytes,
the failing regression, current focused results, the complete cancellation log,
job metadata and pinned checkout input documentation. This change does not claim
that the separately observed WebKit vacancy-selection failure is resolved.
