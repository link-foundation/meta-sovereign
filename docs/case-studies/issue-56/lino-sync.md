# Lino socket and peer transport investigation

R-AA16 includes JavaScript WebSocket sync, WebRTC signaling and WebRTC data channels. Migrating HTTP and SSE alone left these paths serializing JSON. In particular, the raw WebSocket reader accepted only text frames, so selecting a binary codec without changing framing would silently discard messages.

## Reproduction and implementation

`experiments/issue-56/verify-sync-baseline.mjs` extracts the pre-migration WebSocket modules from commit `7e822142155e17f986f5285f293c2a13b2cb5f8f` into a temporary module graph and runs the default-wire regression without changing the checkout. Its bounded input is a single record with Unicode, CRLF, quotes, an empty array and a one-element boolean array. The baseline emits JSON; the Lino decoder rejects it with `ParseError`. The same test passes with the new transport. The retained before/after logs are under `data/`.

The shared `sync/wire.js` uses the existing typed Lino AST and binary codec. Connections select `meta-sovereign-sync.lino.v2` or `meta-sovereign-sync.lino-binary.v2`; no decoder guesses the representation from its payload. The Node client, native Bun/Deno clients, browser signaling client, both server implementations and RTC data channel agree on this selection. The signaling broker decodes once and re-encodes for each recipient, allowing a text peer to signal a binary peer without changing room isolation or origin checks.

Legacy `meta-sovereign-sync.v1` JSON requires explicit `jsonCompatibility: true`. An unversioned incoming WebSocket uses Lino by default and legacy JSON only when compatibility is enabled. Updated clients always request a versioned protocol and reject a missing or different selection. Older servers and RTC peers must therefore be upgraded together, or connected through an explicitly configured JSON compatibility client/server pair; there is no automatic fallback after a failed negotiation. An RTC channel without the selected protocol is rejected.

Each encoded message and disconnected queue is bounded to 4 MiB. The Node frame reader supports binary and masked frames, partial reads, continuation frames and interleaved ping frames. It rejects excessive declared lengths before allocating payload buffers, invalid UTF-8, reserved bits, malformed control frames and more than 1,024 fragments. Binary data channels use `arraybuffer`. RTC's negotiated SCTP message limit can be smaller than the codec limit; this change does not add application-level chunking or claim delivery of oversized RTC messages.

## Verification

- `lino-sync-ws.test.js`: default Lino, explicit text/binary peers, per-recipient broadcasts, portable binary clients, sends after close and explicit JSON compatibility.
- `sync-wire.test.js`: protocol preference, strict representation checks, snapshot queues, fragmented Unicode, masked binary data, ping handling and finite oversized-header probes.
- `webrtc-signaling.test.js`: typed SDP exchange across mixed text/binary peers and existing room/announcement semantics.
- `webrtc-transport.test.js`: actual selected protocol, queued typed binary records, rejection of an unversioned channel and existing negotiation regression coverage.
- `server-sync.test.js` and `sync-ws.test.js`: existing peer convergence, filtering and server integration.
- `e2e-lino-sync.mjs`: two isolated IndexedDB stores converge and delete over the real browser data channel. It verifies exact Unicode/container values, excludes secrets, checks actual Lino signaling frames and confirms the server store never receives the peer-only record. This test is registered in the existing browser CI matrix.

A headed temporary-profile fixture was also checked through Playwright MCP: two fresh browser contexts received `{tokens: ['🚀', 'lino'], body: '你好\r\nПривет', single: [true], empty: []}`, negotiated `meta-sovereign-sync.lino.v2`, excluded the secret and propagated deletion without page errors. The initial attempt reused a previously connected profile and returned no record; the successful check created two independent fresh contexts and explicitly polled the received value. Its result is retained; no provider accounts were used. All fixture contexts, the browser and server were closed afterward.

While adding the binary-client regression, awaiting a raw TCP half-close left an upgraded socket open. The client now destroys its own socket and resolves close on the actual close event; native clients explicitly reject sends after close instead of relying on platform-specific WebSocket behavior. A separate early test setup used an error helper that did not reject EventTarget handshake errors and hung until stopped. The corrected helper listens for both open and error. These setup failures are not counted as passing verification.

## Sources and remaining scope

The selected subprotocol follows the [WebSocket protocol negotiation contract](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-WebSocket-Protocol); framing follows [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html). Binary browser channels use the documented [RTCDataChannel binaryType](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/binaryType). Bun's implementation uses its [native upgrade data and headers](https://bun.com/docs/runtime/http/websockets), preserving the registered endpoint's configuration.

R-AA16 remains unfinished until TCP sync and Rust transport parity are implemented and verified. Mesh discovery, reconnection/replication placement and the rest of issue 56 have separate acceptance criteria; passing these transport checks does not complete them.
