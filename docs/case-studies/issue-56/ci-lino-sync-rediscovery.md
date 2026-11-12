# Read sync records across offline rediscovery

Published parent `2389fc8e2e3c8ae72277d0becc720dd56c6b06f5` fails
[WebKit shard 4, job 131312063036](https://github.com/link-foundation/meta-sovereign/actions/runs/43254148533/job/131312063036).
The preserved job log has 1,233 lines. Lines 1163–1167 show the second peer
booting offline, exposing its API, then rediscovering the server and reloading.
Line 1170 fails with `globalThis.__msApi.get` while the new document is loading.
This identifies the reason the earlier instrumentation could not establish:
the poll assumed its initial API readiness check survived document replacement.

The mandatory real-WebRTC fixture now deliberately boots its second peer offline,
releases discovery, and dispatches an online event. Production rediscovery causes
the reload. A finite bundle gate exposes the actual new-document gap, without
replacing the API, storage, WebSocket, RTCPeerConnection or signaling protocol.
The gate releases after 500 ms and has a five-second emergency release.

Read polling returns an explicit not-ready result while the API is absent or
Playwright loses an execution context during navigation. Other errors still
fail. Convergence captures the record and excluded-secret read in one poll;
deletion requires a ready API and an absent record. Missing API state cannot
falsely confirm deletion. Existing 20-second convergence and 10-second deletion
deadlines and all exact typed Unicode, real SDP/data-channel, secret exclusion
and no-server-write assertions remain in force.

```sh
python3 -B experiments/issue-56/lino-sync-reload-before.py
python3 -B experiments/issue-56/trace-lino-sync.py
```

The actual-parent replay fails with the hosted TypeError in the controlled
rediscovery gap and unconditionally restores the file. The focused native WebKit
check then passes, including insertion and deletion. Scoped lint, formatting,
secret scanning and the unchanged duplication gate are recorded in the
[checksummed evidence archive](data/ci-lino-sync-rediscovery.tar.gz).

An earlier investigation reloaded a peer that had already connected. Readiness
handling exposed a separate stale-channel deletion timeout. Its raw before/after
logs remain in the archive. That connection lifecycle issue is still open; this
CI correction does not establish reconnect or complete multipeer parity.

The independently published workplace-field commit was merged forward with the
private translation unit. Twenty-eight relevant Node tests pass on the combined
sources. One native translation run timed out at a disabled Generate button; a
second unchanged run passes all six scenarios. Its cause remains unestablished.
`CV_TRANSLATION_DEBUG=1` enables bounded boot decisions and failure screenshots
for the synthetic fixture; it is off by default. Both logs are preserved, and
hosted validation of the final commit remains required.

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and
unmerged. Reconnect, full CV synchronization, live translator checks and every
other unchecked issue criterion remain unfinished.
