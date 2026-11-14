# Native Links Notation transport

Related implementation: [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57), R-AA16. Existing native endpoints previously accepted and returned JSON unconditionally. The socket handshake omitted the selected subprotocol, the reader ignored binary frames, text decoding was lossy and queues were unbounded. A JavaScript client enforcing the new Lino protocol could not connect to that server.

## Boundary and codec

The Rust server now negotiates `text/lino`, `application/lino-binary`, `text/lino-line` and `text/lino-compact`. Default replies are readable Lino. JSON media and the legacy socket protocol require an explicit server option, CLI flag or environment opt-in; explicit Lino requests still work in compatibility mode. Internal handler values and existing library event APIs retain their JSON-shaped model without enabling JSON network traffic. Raw static files and Prometheus metrics retain their formats.

The official `links-notation` 0.31.3 Rust crate owns syntax, concrete syntax trees and binary packets. A bounded adapter maps the application's typed object model onto those structures. Using only the semantic AST for readable text would lose quotes and line boundaries, including the distinction between compact `null` and readable `[null]`; the concrete tree and first-line classification preserve those distinctions. Native readable output uses explicit object markers, escapes control characters and writes large Numbers in exponent notation. The JavaScript unsafe-number defect and shared workaround are documented in [dependency-updates.md](dependency-updates.md#readable-numeric-values).

HTTP rejects unsupported media, unacceptable responses, malformed UTF-8/syntax, oversized bodies and incomplete writes before mutation. Specific Accept exclusions override wildcards. Existing origin/Host boundaries, CORS, CSP and raw routes remain active. Native HTTP bodies are limited to 16 MiB; codecs separately bound bytes, nesting and binary graph expansion. Transfer encoding is explicitly unsupported rather than partially decoded.

## Socket behavior

`/ws` and `/rtc` select the same versioned text/binary subprotocols as production JavaScript. Each room recipient receives its negotiated representation, including peer announcements; rooms remain isolated. A connection without a protocol defaults to readable Lino, or JSON under explicit compatibility. Mismatched frames never trigger a decoder fallback.

The reader requires masked client frames, preserves fragmented Unicode and binary bytes, supports interleaved ping/pong and rejects malformed, oversized or invalid-UTF-8 frames. Fragment buffers, disconnected queues and incoming event queues have finite limits; the message/queue ceiling is 4 MiB. Header lengths are rejected before payload allocation. All data and control writes for a connection share a serialized writer so partial concurrent writes cannot interleave. Failed room recipients are removed without disconnecting a valid sender. Shutdown closes upgraded sockets and clears pending events. Rejection diagnostics are off by default; `MS_SYNC_DEBUG=1` emits only a close code.

## Reproduction and verification

- `lino_http.rs`: default representation, all four media, JSON opt-in, quality exclusions and malformed/incomplete/oversized bodies without store changes. Both original HTTP cases fail against the old server; `native-http-before.log` preserves that run.
- `lino_wire.rs`: 21 production-JavaScript values × four representations, plus native round-trips and bounded malformed input. Values include Unicode, escaped controls, empty/unary containers, `[null]`, large numbers and numeric-looking keys/strings. The added `[null]` vector failed during development when semantic compact detection discarded its readable shape; `native-null-before.log` preserves that failure.
- `lino_sockets.rs`: mixed text/binary sync and signaling, fragmented Unicode with interleaved ping, room isolation, explicit JSON compatibility, default no-subprotocol behavior and a first frame coalesced with the upgrade request. Existing endpoint/boundary regressions run with explicit legacy compatibility and still pass.
- Nine focused frame unit cases and one finite queue-limit case pass. The queue case uses seven 512 KiB records and rejects another, rather than running a stress test.
- `native-lino-interop.mjs` runs the real native executable against the actual production JavaScript HTTP and socket codecs. All 84 HTTP round-trips and mixed-format signaling pass. With `--sockets-only`, the same probe fails against the isolated original `2a51e2d` binary at protocol negotiation; the process and sockets are always closed. The complete probe is registered in the existing Rust CI job.
- Focused native checks use one compiler/test thread and disabled debug/incremental output. Clippy for the server and all its targets passes with warnings treated as errors. Full workspace/runtime/browser matrices remain assigned to CI.

Observed logs are archived in `data/native-lino.tar.gz`, with a verified per-file SHA-256 manifest. This verifies existing native transport paths, not full native application parity, SSE feature parity, LAN reachability, iPhone connectivity or the remaining issue 56 acceptance criteria. The native listener remains loopback-only; broadening network access requires the separate discovery/authentication workstream.
