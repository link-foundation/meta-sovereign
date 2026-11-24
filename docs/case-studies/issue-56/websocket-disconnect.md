# WebSocket disconnect cleanup and independent lifecycle evidence

The ordinary Node WebSocket endpoint retained an upgraded socket after its TCP
peer ended without a WebSocket close frame. Its close/error handlers did not
observe this half-open state. On parent `d4c7fb81`, the new finite real-network
regression fails with `TCP end removes the old socket` (actual one, expected
zero). The endpoint now removes and destroys that socket on TCP end. The test
then reconnects to the same running endpoint and awaits an actual hello frame.

An independent investigation also reproduced connected WebRTC deletion failure
against that parent's actual browser bundle and signaling adapters, then verified
an alternative addressed three-peer implementation with 22 focused Node and 22
Deno checks and native WebKit. The branch concurrently published an equivalent
mesh in `21bc514e`. A forward merge retains that published implementation rather
than replacing it with the alternative. The immutable
[alternative archive](data/rtc-lifecycle-alternate.tar.gz) preserves its source
snapshots, actual-parent failures and verification logs; these snapshots describe
an unpublished alternative, not the final merged production sources.

The final merged sources pass 22 focused Node checks (14 socket/room/mesh and
eight transport checks) plus one mandatory native WebKit sync scenario. The
latter retains three independent stores, connected document replacement, fresh
bidirectional writes, deletion, secret isolation, no application records in the
signaling server and a surviving pair after the third peer departs. The
[merged evidence](data/websocket-disconnect.tar.gz) records the exact sources and
logs. No full local suite or browser/runtime matrix was run.

Offline reconciliation, signaling reconnect, TURN configuration and every other
unchecked original criterion remain required. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
