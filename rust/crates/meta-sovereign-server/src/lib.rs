//! `meta-sovereign-server` — pure-Rust HTTP + WebSocket + WebRTC
//! signalling server for meta-sovereign (R-G2).
//!
//! Wire-protocol parity with the JS server in `js/src/server/`:
//!
//! - REST endpoints on `/links`, `/api/*`, `/sources` use the same JSON
//!   shapes the SPA expects, so `js/src/web/discover.js` will pick this
//!   server up indistinguishably from the JS one.
//! - `/ws` is an RFC 6455 WebSocket sync transport using the same
//!   newline-delimited JSON event protocol as `js/src/sync/ws-transport.js`.
//! - `/rtc?room=<name>` is the WebRTC signalling broker — fans every
//!   text frame received in a room to all other members. Matches
//!   `js/src/sync/webrtc-signaling.js`.
//!
//! Zero external dependencies: this crate uses only `std`. WebSocket
//! framing is hand-rolled, mirroring `js/src/sync/ws-frame.js`.

#![forbid(unsafe_code)]

pub mod email;
pub mod handlers;
pub mod http;
pub mod json;
pub mod routes;
pub mod signaling;
pub mod state;
pub mod ws;

pub use http::{serve, LogFormat, ServerHandle, ServerOptions};
pub use routes::MetricsCtx;
pub use state::ServerState;
