# macOS Deno partition deadline

At source `8c2260b6dc99ad04e44f2b2001b774be98b0ede5`,
[macOS Deno shard 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44083368164/job/134043186722)
was cancelled by the unchanged ten-minute job deadline. Its raw log ends at
line 5605 with `The operation was canceled.` The test process began at
12:45:12 UTC, reached greetings tests at 12:45:20 and continued through Q/A and
rolling CLI tests before entering `rolling-host.test.js` at 12:52:59. There is
no failed assertion in the preserved log. The other two macOS Deno partitions
completed in six and five minutes, including setup.

The contiguous middle file range has grown disproportionately as issue 56
adds Q/A coverage. Snapshot copies contribute overhead, but the log does not
support identifying them as the sole cause. The correction splits macOS Deno
into six native runtime partitions, retaining all files, runtime/OS targets,
the existing Intel allocation fallback, type checking, failure propagation and
the ten-minute job limit. Linux and Windows partitions remain unchanged.

A focused configuration regression fails against the old three-part matrix
and passes after the change. It requires the complete six-part partition set,
exclusion of the original unpartitioned macOS Deno pair, the unchanged deadline
and independent failure reporting. Both relevant contract tests pass locally
with one worker. Hosted completion is still needed to verify timing.

The hash-verified [archive](data/ci-deno-macos-partitions.tar.gz) and
[manifest](data/ci-deno-macos-partitions.tar.sha256.json) retain the actual job,
full raw log, run timestamps/SHA and focused checks. No inventory criterion is
accepted; all forty original unchecked criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
