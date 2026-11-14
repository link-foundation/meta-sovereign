# Native HTTP rejection and unread request data

The exact context commit `c9749badd570a5cf2b7ed5a65ccfb2ca7f5ef28d` triggered [Checks and Release run 42652686481](https://github.com/link-foundation/meta-sovereign/actions/runs/42652686481), created on 2026-11-09 at 16:14:13 UTC. Its Rust job failed at 16:17:07 UTC. The complete 85,746-line workflow log, the 575-line Rust job log, metadata and focused reproduction are preserved with verified hashes in `data/ci-native-rejection.tar.gz`.

Rust log lines 548–550 locate the failure at `tests/lino_http.rs:28`: the client's `read_to_end` returned OS error 104, `Connection reset by peer`. Full workflow log lines 13983–13984 contain the same error. The existing malformed-media/incomplete-body test passed when run alone locally, so rerunning it alone could not establish a correction.

The server reads headers in 2 KiB chunks. Unsupported media, unacceptable response formats, excessive advertised length and other boundary checks can return before consuming the request body. Dropping the connection with unread kernel input can reset TCP and prevent the client from reading the already-written HTTP error. This matches the staged connection-close problem described in [RFC 9112 section 9.6](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.6).

The new regression sends a finite 64 KiB payload, rather than depending on the packet timing of the original twelve-byte body. Against the original server it fails immediately with the same OS error 104. After correction it verifies complete readable Lino error responses for unsupported media (415), unacceptable representation (406), oversized advertised length (413), transfer encoding (400), denied origin (403) and unsupported WebSocket protocol (406). Every rejection leaves the store empty. Only 64 KiB is sent even when the advertised length exceeds the 16 MiB limit.

Early rejection paths now write the response, close the sending half of TCP and briefly drain incoming bytes before dropping the connection. Draining uses a 4 KiB stack buffer, a 64 KiB total limit and a 100 ms absolute deadline. The deadline is recalculated before every read, so a trickling client cannot extend it indefinitely. It does not allocate the advertised body, parse rejected input, change validation status or hide a failed response write. Ordinary successful HTTP and accepted WebSocket connections retain their existing path. Malformed request and rejected upgrade paths use the same close behavior.

Focused validation uses one Cargo job and the existing warmed target directory:

```sh
CARGO_TARGET_DIR=/tmp/issue-56-rust-target CARGO_BUILD_JOBS=1 \
  cargo +1.99.1 test --manifest-path rust/Cargo.toml \
  -p meta-sovereign-server --test lino_http -- --test-threads=1
```

All four HTTP integration cases pass, including the new failing-before regression. Rust formatting and focused Clippy with warnings denied also pass. The complete native matrix remains a CI responsibility.

This workflow also cancelled its Node/macOS job when the ten-minute job deadline was reached, independently of the Rust failure: the matrix has `fail-fast: false`. The job ran tests from 16:20:35 to 16:28:29 and reported no individual test failure before cancellation. Its logs are retained in this archive; the cause and exact-head rerun still need investigation. The other eight runtime jobs, Chromium, WebKit, packaging, preflight, native helper and security checks passed. A cancelled job is not passing coverage, and this draft remains unfinished.

Follow-up: [run 42658182735](https://github.com/link-foundation/meta-sovereign/actions/runs/42658182735), created at 16:46:43 UTC for exact correction commit `46fba37df2fc8183366a41c3e809ff548dbbce8f`, passes Rust and all nine runtime jobs. The macOS Node test step completes from 16:51:40 to 16:56:21 (4 minutes 41 seconds). No individual failure or repeated timeout identifies a further root cause; the job timeout was not increased and no checks were bypassed. This does not imply completion of unrelated issue-wide criteria. Status metadata is retained with the capability follow-up evidence.

That run subsequently fails its separate WebKit profile-selection scenario; see [the preserved diagnostic evidence](ci-profile-selection.md). The native correction passes, while the workflow overall is not passing.
