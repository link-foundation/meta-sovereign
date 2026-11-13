//! `meta-sovereign-server` — pure-Rust HTTP + WebSocket + WebRTC
//! signalling server for meta-sovereign (R-G2).
//!
//! Structured transport shared with the JS server in `js/src/server/`:
//!
//! - Existing REST endpoints negotiate readable, single-line, compact or binary
//!   Links Notation. Legacy JSON requires `ServerOptions::json_compatibility`.
//! - `/ws` and `/rtc?room=<name>` negotiate versioned text/binary Lino protocols,
//!   validate bounded frames and encode values for each recipient's format.
//! - Internal values retain the existing JSON-shaped model; JSON is not the
//!   default network representation. Endpoint and product parity remain open.
//!
//! The official `links-notation` parser and binary codec own wire syntax.
//! HTTP and WebSocket I/O use `std`; no asynchronous runtime is required.

#![forbid(unsafe_code)]

mod checkpoint;
mod durable;
pub mod email;
pub mod handlers;
pub mod http;
pub mod json;
pub mod record_sync;
pub mod routes;
pub mod signaling;
pub mod state;
pub mod wire;
pub mod ws;

pub use http::{LogFormat, ServerHandle, ServerOptions, serve};
pub use routes::MetricsCtx;
pub use state::ServerState;
