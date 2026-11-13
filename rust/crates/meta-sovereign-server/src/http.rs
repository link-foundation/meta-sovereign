//! TCP-based HTTP/1.1 server with WebSocket upgrade support.
//!
//! Pure-`std` implementation — no Hyper, no Tokio. Each connection
//! runs on its own OS thread. The server fully reads the request
//! head (until `\r\n\r\n`), then either:
//!
//! - dispatches a regular HTTP request through [`crate::routes`] and
//!   writes the response,
//! - upgrades to a WebSocket sync session on `/ws`, or
//! - upgrades to a WebRTC signalling room on `/rtc`.
//!
//! The `serve()` entry point spawns a listener thread and returns a
//! [`ServerHandle`] that can be queried for the bound port and
//! closed. Closing sets a stop flag and connects once to wake the
//! listener; in-flight workers exit when their socket closes.

use std::collections::{BTreeMap, HashMap};
use std::io::{Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::handlers;
use crate::json::{self, Value};
use crate::routes::{MetricsCtx, StaticRoot, dispatch};
use crate::signaling::Signaling;
use crate::state::ServerState;
use crate::wire::socket::{MAX_SYNC_BYTES, SocketWire, SocketWriter};
use crate::wire::{self, Format};
use crate::ws::{Frame, FrameReader, accept_key, encode_close_frame, encode_pong_payload};

const MAX_HEAD_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;
const PAGES_ORIGIN: &str = "https://link-foundation.github.io";

// Apply the same loopback Host and exact-origin boundary before HTTP,
// WebSocket sync and WebRTC signalling. CORS never uses a wildcard.
fn request_boundary(req: &Request, port: u16) -> Option<Response> {
    let host = req
        .headers
        .get("host")
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let valid_host = ["127.0.0.1", "localhost", "[::1]"]
        .iter()
        .any(|name| host == format!("{name}:{port}"));
    if !valid_host {
        return Some(Response::json(
            421,
            "{\"error\":\"unexpected Host header\"}",
        ));
    }
    let origin = req.headers.get("origin").map(String::as_str);
    let same = origin == Some(format!("http://{host}").as_str());
    if origin.is_some() && origin != Some(PAGES_ORIGIN) && !same {
        return Some(Response::json(403, "{\"error\":\"origin denied\"}"));
    }
    if origin.is_none()
        && req.headers.get("sec-fetch-site").map(String::as_str) == Some("cross-site")
    {
        return Some(Response::json(
            403,
            "{\"error\":\"cross-site request denied\"}",
        ));
    }
    if req.method == "OPTIONS" {
        let method = req
            .headers
            .get("access-control-request-method")
            .map(String::as_str)
            .unwrap_or("");
        let headers = req
            .headers
            .get("access-control-request-headers")
            .map(String::as_str)
            .unwrap_or("");
        if origin != Some(PAGES_ORIGIN)
            || !["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"].contains(&method)
            || headers
                .split(',')
                .any(|h| !h.trim().is_empty() && !h.trim().eq_ignore_ascii_case("content-type"))
        {
            return Some(Response::json(403, "{\"error\":\"preflight denied\"}"));
        }
        let mut response = Response::bytes(204, "text/plain", Vec::new());
        response.headers.extend([
            ("access-control-allow-origin".into(), PAGES_ORIGIN.into()),
            (
                "access-control-allow-methods".into(),
                "GET, HEAD, PUT, POST, DELETE, OPTIONS".into(),
            ),
            ("access-control-allow-headers".into(), "content-type".into()),
            ("vary".into(), "Origin".into()),
        ]);
        if req
            .headers
            .get("access-control-request-private-network")
            .map(String::as_str)
            == Some("true")
        {
            response
                .headers
                .push(("access-control-allow-private-network".into(), "true".into()));
        }
        return Some(response);
    }
    None
}

#[derive(Debug, Clone)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub query: BTreeMap<String, String>,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    pub fn json(status: u16, body: &str) -> Self {
        Self {
            status,
            headers: vec![(
                "content-type".into(),
                "application/json; charset=utf-8".into(),
            )],
            body: body.as_bytes().to_vec(),
        }
    }
    pub fn bytes(status: u16, content_type: &str, body: Vec<u8>) -> Self {
        Self {
            status,
            headers: vec![("content-type".into(), content_type.into())],
            body,
        }
    }
    pub fn body_string(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }
}

#[derive(Default, Clone, Copy, PartialEq, Eq)]
pub enum LogFormat {
    /// No access logging — keeps stdout silent in tests and dev runs.
    #[default]
    None,
    /// One JSON object per line, mirroring `js/src/server/log.js`.
    Json,
}

#[derive(Default, Clone)]
pub struct ServerOptions {
    pub port: u16,
    pub static_root: Option<PathBuf>,
    pub log_format: LogFormat,
    /// Legacy JSON is disabled unless explicitly requested.
    pub json_compatibility: bool,
    /// Native checkpoint directory; None is an explicit in-memory fixture.
    pub data_dir: Option<PathBuf>,
    /// Apply schema-gated replica traffic. False preserves the low-level
    /// transport fixture API; the native CLI always enables application.
    pub apply_sync: bool,
}

pub struct ServerHandle {
    addr: SocketAddr,
    stop: Arc<AtomicBool>,
    state: Arc<ServerState>,
    signaling: Signaling,
    ws_outgoing: WsSender,
    ws_incoming: Arc<Mutex<SyncInbox>>,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.addr.port()
    }
    pub fn state(&self) -> &Arc<ServerState> {
        &self.state
    }
    pub fn signaling(&self) -> &Signaling {
        &self.signaling
    }
    pub fn ws_peer_count(&self) -> usize {
        self.ws_outgoing.count()
    }
    /// Accept an internal JSON-shaped event and encode it in each /ws peer's
    /// negotiated representation. This API does not enable JSON on the wire.
    pub fn ws_broadcast(&self, text: &str) -> std::io::Result<()> {
        let value = Format::Json
            .decode(text.as_bytes())
            .map_err(std::io::Error::other)?;
        self.ws_outgoing.broadcast(&value)
    }
    /// Drain received /ws values as internal JSON strings for existing callers.
    pub fn ws_drain(&self) -> Vec<String> {
        let mut g = self.ws_incoming.lock().expect("incoming poisoned");
        g.bytes = 0;
        std::mem::take(&mut g.events)
    }
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::SeqCst);
        self.ws_outgoing.close();
        self.signaling.close();
        // Wake the accept loop with a connect.
        let _ = TcpStream::connect(self.addr);
    }
}

#[derive(Clone, Default)]
struct WsSender {
    sockets: Arc<Mutex<Vec<SyncSocket>>>,
    pending: Arc<Mutex<PendingSync>>,
}

struct SyncSocket {
    socket: SocketWriter,
    wire: SocketWire,
}
#[derive(Default)]
struct PendingSync {
    events: Vec<Value>,
    bytes: usize,
}
#[derive(Default)]
struct SyncInbox {
    events: Vec<String>,
    bytes: usize,
}

impl SyncInbox {
    fn push(&mut self, value: Value) -> std::io::Result<()> {
        let text = json::encode(&value);
        if self.bytes.saturating_add(text.len()) > MAX_SYNC_BYTES {
            return Err(std::io::Error::other("incoming sync queue exceeds 4 MiB"));
        }
        self.bytes += text.len();
        self.events.push(text);
        Ok(())
    }
}

impl WsSender {
    fn add(&self, socket: SocketWriter, wire: SocketWire) -> std::io::Result<()> {
        let mut g = self.sockets.lock().expect("ws sockets poisoned");
        let mut p = self.pending.lock().expect("ws pending poisoned");
        for value in &p.events {
            socket.write(&wire.frame(value)?)?;
        }
        *p = PendingSync::default();
        g.push(SyncSocket { socket, wire });
        Ok(())
    }
    fn drop_socket(&self, target: &TcpStream) {
        let mut g = self.sockets.lock().expect("ws sockets poisoned");
        let target_addr = target.peer_addr().ok();
        g.retain(|s| s.socket.peer_addr().ok() != target_addr);
    }
    fn broadcast(&self, value: &Value) -> std::io::Result<()> {
        let canonical = SocketWire::negotiate(None, false).unwrap().frame(value)?;
        let mut g = self.sockets.lock().expect("ws sockets poisoned");
        if g.is_empty() {
            let mut pending = self.pending.lock().expect("ws pending poisoned");
            if pending.bytes.saturating_add(canonical.len()) > MAX_SYNC_BYTES {
                return Err(std::io::Error::other("pending sync queue exceeds 4 MiB"));
            }
            pending.bytes += canonical.len();
            pending.events.push(value.clone());
            return Ok(());
        }
        let mut frames = Vec::new();
        for peer in g.iter() {
            if !frames.iter().any(|(format, _)| *format == peer.wire.format) {
                frames.push((peer.wire.format, peer.wire.frame(value)?));
            }
        }
        let mut failure = None;
        g.retain_mut(|peer| {
            let frame = &frames
                .iter()
                .find(|(format, _)| *format == peer.wire.format)
                .unwrap()
                .1;
            if let Err(error) = peer.socket.write(frame) {
                peer.socket.shutdown();
                failure = Some(error);
                false
            } else {
                true
            }
        });
        failure.map_or(Ok(()), Err)
    }
    fn close(&self) {
        let mut peers = self.sockets.lock().expect("ws sockets poisoned");
        for peer in peers.drain(..) {
            peer.socket.shutdown();
        }
        *self.pending.lock().expect("ws pending poisoned") = PendingSync::default();
    }
    fn count(&self) -> usize {
        self.sockets.lock().expect("ws sockets poisoned").len()
    }
}

pub fn serve(opts: ServerOptions) -> std::io::Result<ServerHandle> {
    let listener = TcpListener::bind(("127.0.0.1", opts.port))?;
    let addr = listener.local_addr()?;
    let stop = Arc::new(AtomicBool::new(false));
    let state = Arc::new(match &opts.data_dir {
        Some(directory) => ServerState::open(directory).map_err(std::io::Error::from)?,
        None => ServerState::new(),
    });
    let static_root = Arc::new(StaticRoot::new(opts.static_root.clone()));
    let signaling = Signaling::new();
    let ws_outgoing = WsSender::default();
    let ws_incoming = Arc::new(Mutex::new(SyncInbox::default()));
    let log_format = opts.log_format;
    let json_compatibility = opts.json_compatibility;
    let apply_sync = opts.apply_sync;

    let stop_l = Arc::clone(&stop);
    let state_l = Arc::clone(&state);
    let static_l = Arc::clone(&static_root);
    let signaling_l = signaling.clone();
    let ws_out_l = ws_outgoing.clone();
    let ws_in_l = Arc::clone(&ws_incoming);

    thread::Builder::new()
        .name("meta-sovereign-rs-accept".into())
        .spawn(move || {
            for stream in listener.incoming() {
                if stop_l.load(Ordering::SeqCst) {
                    break;
                }
                let stream = match stream {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                let ctx = ConnectionCtx {
                    state: Arc::clone(&state_l),
                    root: Arc::clone(&static_l),
                    signaling: signaling_l.clone(),
                    ws_outgoing: ws_out_l.clone(),
                    ws_incoming: Arc::clone(&ws_in_l),
                    log_format,
                    json_compatibility,
                    apply_sync,
                };
                thread::spawn(move || {
                    let _ = handle_connection(stream, ctx);
                });
            }
        })?;

    Ok(ServerHandle {
        addr,
        stop,
        state,
        signaling,
        ws_outgoing,
        ws_incoming,
    })
}

struct ConnectionCtx {
    state: Arc<ServerState>,
    root: Arc<StaticRoot>,
    signaling: Signaling,
    ws_outgoing: WsSender,
    ws_incoming: Arc<Mutex<SyncInbox>>,
    log_format: LogFormat,
    json_compatibility: bool,
    apply_sync: bool,
}

fn handle_connection(mut stream: TcpStream, ctx: ConnectionCtx) -> std::io::Result<()> {
    let ConnectionCtx {
        state,
        root,
        signaling,
        ws_outgoing,
        ws_incoming,
        log_format,
        json_compatibility,
        apply_sync,
    } = ctx;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(60)));
    let (head, leftover) = match read_head(&mut stream)? {
        Some(v) => v,
        None => return Ok(()),
    };
    let parsed = match parse_request(&head) {
        Some(v) => v,
        None => {
            let _ = write_response(
                &mut stream,
                &wire::http::encode_response(
                    wire::http::error(400, "bad-request", "bad request"),
                    Format::Text,
                ),
            );
            close_after_rejection(&mut stream);
            return Ok(());
        }
    };

    if let Some(response) = request_boundary(&parsed, stream.local_addr()?.port()) {
        return reject_wire_response(&mut stream, response, &parsed, json_compatibility);
    }

    if is_websocket_upgrade(&parsed) {
        let Some(wire) = SocketWire::negotiate(
            parsed
                .headers
                .get("sec-websocket-protocol")
                .map(String::as_str),
            json_compatibility,
        ) else {
            return reject_wire_response(
                &mut stream,
                wire::http::error(
                    406,
                    "unsupported-protocol",
                    "offer a supported Lino sync protocol",
                ),
                &parsed,
                json_compatibility,
            );
        };
        if parsed.path == "/ws" {
            return upgrade_ws(
                stream,
                &parsed,
                ws_outgoing,
                ws_incoming,
                wire,
                &leftover,
                apply_sync.then_some(state),
            );
        }
        if parsed.path == "/rtc" {
            return upgrade_rtc(stream, &parsed, signaling, wire, &leftover);
        }
        let _ = write_raw(
            &mut stream,
            "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n",
        );
        close_after_rejection(&mut stream);
        return Ok(());
    }

    let started = std::time::Instant::now();
    let mut req = parsed;
    let format = wire::http::select(
        req.headers.get("accept").map(String::as_str),
        json_compatibility,
    );
    let fail = |stream: &mut TcpStream, status, code, message| {
        reject_wire_response(
            stream,
            wire::http::error(status, code, message),
            &req,
            json_compatibility,
        )
    };
    if format.is_none() && !matches!(req.method.as_str(), "GET" | "HEAD") {
        return fail(
            &mut stream,
            406,
            "not-acceptable",
            "no acceptable response representation",
        );
    }
    if req.headers.contains_key("transfer-encoding")
        || (req.headers.contains_key("content-length") && content_length(&req.headers).is_none())
    {
        return fail(
            &mut stream,
            400,
            "bad-length",
            "a valid Content-Length is required; transfer encoding is unsupported",
        );
    }
    let need = content_length(&req.headers).unwrap_or(0);
    if need > MAX_BODY_BYTES {
        return fail(
            &mut stream,
            413,
            "too-large",
            "request body exceeds the server limit",
        );
    }
    if need > 0 {
        let default = if json_compatibility {
            Format::Json
        } else {
            Format::Text
        };
        if Format::from_media(
            req.headers
                .get("content-type")
                .map(String::as_str)
                .unwrap_or(default.media()),
            json_compatibility,
        )
        .is_err()
        {
            return fail(
                &mut stream,
                415,
                "unsupported-media",
                "use text/lino or application/lino-binary",
            );
        }
    }
    let mut body = leftover;
    while body.len() < need && body.len() < MAX_BODY_BYTES {
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf)?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&buf[..n]);
    }
    if body.len() < need {
        return fail(
            &mut stream,
            400,
            "incomplete-body",
            "request body ended before Content-Length",
        );
    }
    body.truncate(need);
    req.body = body;
    if let Err(error) = wire::http::decode_request(&mut req, json_compatibility) {
        return write_wire_response(
            &mut stream,
            wire::http::error(400, "bad-lino", &error),
            &req,
            json_compatibility,
        );
    }

    let metrics_ctx = MetricsCtx {
        ws_peers: ws_outgoing.count(),
        rtc_rooms: signaling.rooms().len(),
    };
    let response = dispatch(&state, &root, &req, metrics_ctx);
    let response = if format.is_none()
        && response.headers.iter().any(|(key, value)| {
            key.eq_ignore_ascii_case("content-type") && value.starts_with("application/json")
        }) {
        wire::http::error(
            406,
            "not-acceptable",
            "no acceptable response representation",
        )
    } else {
        response
    };
    let status = response.status;
    write_wire_response(&mut stream, response, &req, json_compatibility)?;
    if log_format == LogFormat::Json {
        let duration_ms = started.elapsed().as_millis();
        emit_json_log(&req.method, &req.path, status, duration_ms);
    }
    Ok(())
}

fn reject_wire_response(
    stream: &mut TcpStream,
    response: Response,
    req: &Request,
    compatibility: bool,
) -> std::io::Result<()> {
    write_wire_response(stream, response, req, compatibility)?;
    close_after_rejection(stream);
    Ok(())
}

fn close_after_rejection(stream: &mut TcpStream) {
    // RFC 9112 section 9.6: closing with unread request data can send a TCP
    // reset that discards the response. Half-close first, then briefly drain
    // without trusting Content-Length or letting a slow sender hold a worker.
    if stream.shutdown(Shutdown::Write).is_err() {
        return;
    }
    let deadline = Instant::now() + Duration::from_millis(100);
    let mut remaining = 64 * 1024;
    let mut buf = [0u8; 4096];
    while remaining > 0 {
        let Some(wait) = deadline.checked_duration_since(Instant::now()) else {
            break;
        };
        if wait.is_zero() || stream.set_read_timeout(Some(wait)).is_err() {
            break;
        }
        let limit = remaining.min(buf.len());
        match stream.read(&mut buf[..limit]) {
            Ok(0) | Err(_) => break,
            Ok(n) => remaining -= n,
        }
    }
}

fn write_wire_response(
    stream: &mut TcpStream,
    response: Response,
    req: &Request,
    compatibility: bool,
) -> std::io::Result<()> {
    let format = wire::http::select(req.headers.get("accept").map(String::as_str), compatibility)
        .unwrap_or(Format::Text);
    let mut response = wire::http::encode_response(response, format);
    response
        .headers
        .push(("vary".into(), "Origin, Accept".into()));
    if req.headers.get("origin").map(String::as_str) == Some(PAGES_ORIGIN)
        && !response
            .headers
            .iter()
            .any(|(key, _)| key.eq_ignore_ascii_case("access-control-allow-origin"))
    {
        response
            .headers
            .push(("access-control-allow-origin".into(), PAGES_ORIGIN.into()));
    }
    write_response(stream, &response)
}

fn emit_json_log(method: &str, path: &str, status: u16, duration_ms: u128) {
    let ts = format_iso8601(std::time::SystemTime::now());
    let line = format!(
        "{{\"ts\":\"{ts}\",\"level\":\"info\",\"event\":\"http\",\
         \"method\":\"{}\",\"path\":\"{}\",\"status\":{},\"duration_ms\":{}}}\n",
        json_escape(method),
        json_escape(path),
        status,
        duration_ms
    );
    let _ = std::io::Write::write_all(&mut std::io::stdout().lock(), line.as_bytes());
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn format_iso8601(t: std::time::SystemTime) -> String {
    let secs = t
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let total_ms = secs as i64;
    let total_secs = total_ms / 1000;
    let ms = (total_ms % 1000) as u32;
    let (year, month, day, hour, minute, second) = unix_to_ymdhms(total_secs);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{ms:03}Z")
}

/// Convert a UNIX timestamp (seconds) to (year, month, day, hour, min, sec).
/// Pure-Rust, no chrono dependency.
fn unix_to_ymdhms(secs: i64) -> (i32, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400) as u32;
    let hour = rem / 3600;
    let minute = (rem % 3600) / 60;
    let second = rem % 60;
    // Days since 1970-01-01 -> civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year as i32, month, day, hour, minute, second)
}

fn read_head(stream: &mut TcpStream) -> std::io::Result<Option<(String, Vec<u8>)>> {
    let mut buf = Vec::with_capacity(2048);
    let mut tmp = [0u8; 2048];
    loop {
        let n = stream.read(&mut tmp)?;
        if n == 0 {
            return Ok(None);
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(idx) = find_subseq(&buf, b"\r\n\r\n") {
            if idx > MAX_HEAD_BYTES {
                return Ok(None);
            }
            let Ok(head) = String::from_utf8(buf[..idx].to_vec()) else {
                return Ok(None);
            };
            let leftover = buf[idx + 4..].to_vec();
            return Ok(Some((head, leftover)));
        }
        if buf.len() > MAX_HEAD_BYTES {
            return Ok(None);
        }
    }
}

fn find_subseq(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    for i in 0..=hay.len() - needle.len() {
        if &hay[i..i + needle.len()] == needle {
            return Some(i);
        }
    }
    None
}

fn parse_request(head: &str) -> Option<Request> {
    let mut lines = head.split("\r\n");
    let start = lines.next()?;
    let mut sp = start.splitn(3, ' ');
    let method = sp.next()?.to_string();
    let target = sp.next()?;
    let _version = sp.next()?;
    let (path, query) = split_path_query(target);
    let mut headers = BTreeMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length")
                && headers.contains_key("content-length")
            {
                return None;
            }
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    Some(Request {
        method,
        path,
        query,
        headers,
        body: Vec::new(),
    })
}

fn split_path_query(target: &str) -> (String, BTreeMap<String, String>) {
    let mut q = BTreeMap::new();
    let (path, qs) = match target.split_once('?') {
        Some((p, q)) => (p.to_string(), q),
        None => return (target.to_string(), q),
    };
    for pair in qs.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        q.insert(handlers::url_decode(k), handlers::url_decode(v));
    }
    (path, q)
}

fn content_length(headers: &BTreeMap<String, String>) -> Option<usize> {
    headers.get("content-length").and_then(|v| v.parse().ok())
}

fn is_websocket_upgrade(req: &Request) -> bool {
    let upgrade = req
        .headers
        .get("upgrade")
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    let connection = req
        .headers
        .get("connection")
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or_default();
    upgrade == "websocket"
        && connection.split(',').any(|s| s.trim() == "upgrade")
        && req.headers.contains_key("sec-websocket-key")
}

fn write_handshake(stream: &mut TcpStream, req: &Request, wire: SocketWire) -> std::io::Result<()> {
    let key = req
        .headers
        .get("sec-websocket-key")
        .map(String::as_str)
        .unwrap_or("");
    let accept = accept_key(key);
    let protocol = if wire.protocol.is_empty() {
        String::new()
    } else {
        format!("Sec-WebSocket-Protocol: {}\r\n", wire.protocol)
    };
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n{protocol}\r\n"
    );
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    stream.write_all(resp.as_bytes())
}

fn read_socket(
    stream: &mut TcpStream,
    writer: &SocketWriter,
    initial: &[u8],
    wire: SocketWire,
    mut receive: impl FnMut(Value) -> std::io::Result<()>,
) -> std::io::Result<()> {
    read_socket_until(stream, writer, initial, wire, None, |value| {
        if let Err(error) = receive(value) {
            let _ = writer.write(&encode_close_frame(1009));
            return Err(error);
        }
        Ok(None)
    })
}

fn read_socket_until(
    stream: &mut TcpStream,
    writer: &SocketWriter,
    initial: &[u8],
    wire: SocketWire,
    mut deadline: Option<std::time::Instant>,
    mut receive: impl FnMut(Value) -> std::io::Result<Option<std::time::Instant>>,
) -> std::io::Result<()> {
    let mut reader = FrameReader::client();
    reader.push(initial);
    let mut chunk = [0u8; 4096];
    loop {
        while let Some(frame) = reader.next_frame() {
            let close = match frame {
                Frame::Text(_) | Frame::Binary(_) => match wire.decode(frame) {
                    Ok(value) => {
                        deadline = receive(value)?;
                        None
                    }
                    Err(_) => Some(1003),
                },
                Frame::Ping(bytes) => {
                    writer.write(&encode_pong_payload(&bytes))?;
                    None
                }
                Frame::Pong(_) => None,
                Frame::Close => Some(1000),
                Frame::Invalid(code) => Some(code),
            };
            if let Some(code) = close {
                if code != 1000 && std::env::var("MS_SYNC_DEBUG").as_deref() == Ok("1") {
                    eprintln!("[sync] rejected_frame close_code={code}");
                }
                let _ = writer.write(&encode_close_frame(code));
                let _ = stream.shutdown(Shutdown::Both);
                return Ok(());
            }
        }
        let remaining =
            deadline.map(|limit| limit.saturating_duration_since(std::time::Instant::now()));
        if remaining.is_some_and(|duration| duration.is_zero()) {
            writer.write(&encode_close_frame(1008))?;
            return Ok(());
        }
        stream.set_read_timeout(remaining)?;
        let n = match stream.read(&mut chunk) {
            Err(error)
                if deadline.is_some()
                    && matches!(
                        error.kind(),
                        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                    ) =>
            {
                writer.write(&encode_close_frame(1008))?;
                return Ok(());
            }
            result => result?,
        };
        if n == 0 {
            return Ok(());
        }
        reader.push(&chunk[..n]);
    }
}

fn upgrade_ws(
    mut stream: TcpStream,
    req: &Request,
    ws_outgoing: WsSender,
    ws_incoming: Arc<Mutex<SyncInbox>>,
    wire: SocketWire,
    initial: &[u8],
    state: Option<Arc<ServerState>>,
) -> std::io::Result<()> {
    write_handshake(&mut stream, req, wire)?;
    let writer = SocketWriter::new(stream.try_clone()?);
    ws_outgoing.add(writer.clone(), wire)?;
    let mut live = None;
    let result = if let Some(state) = state {
        let mut session = crate::sync_session::SyncSession::default();
        let hello = writer.write(&wire.frame(&session.hello())?);
        hello.and_then(|()| {
            read_socket_until(
                &mut stream,
                &writer,
                initial,
                wire,
                session.deadline(),
                |value| match session.receive(&state, &value) {
                    Ok(events) => {
                        if live.is_none() && session.matched() {
                            live = Some(start_sync_feed(&state, writer.clone(), wire)?);
                        }
                        for event in events {
                            writer.write(&wire.frame(&event)?)?;
                        }
                        Ok(session.deadline())
                    }
                    Err(error) => {
                        if std::env::var("MS_SYNC_DEBUG").as_deref() == Ok("1") {
                            eprintln!("[sync] admission refused; kind={:?}", error.kind());
                        }
                        let _ = writer.write(&wire.frame(&session.abort())?);
                        let code = if error.kind() == std::io::ErrorKind::InvalidData {
                            1008
                        } else {
                            1011
                        };
                        let _ = writer.write(&encode_close_frame(code));
                        writer.shutdown();
                        Err(error)
                    }
                },
            )
        })
    } else {
        read_socket(&mut stream, &writer, initial, wire, |value| {
            ws_incoming.lock().expect("incoming poisoned").push(value)
        })
    };
    if let Some((feed, worker)) = live {
        feed.close();
        let _ = worker.join();
    }
    ws_outgoing.drop_socket(&stream);
    result
}

fn start_sync_feed(
    state: &ServerState,
    writer: SocketWriter,
    wire: SocketWire,
) -> std::io::Result<(Arc<crate::change_feed::ChangeFeed>, thread::JoinHandle<()>)> {
    let feed = state.subscribe_sync()?;
    let reader = Arc::clone(&feed);
    let worker = thread::Builder::new()
        .name("native-sync-feed".into())
        .spawn(move || {
            while let Some(event) = reader.recv() {
                if wire
                    .frame(&event)
                    .and_then(|frame| writer.write(&frame))
                    .is_err()
                {
                    break;
                }
            }
            writer.shutdown();
        })?;
    Ok((feed, worker))
}

fn upgrade_rtc(
    mut stream: TcpStream,
    req: &Request,
    signaling: Signaling,
    wire: SocketWire,
    initial: &[u8],
) -> std::io::Result<()> {
    write_handshake(&mut stream, req, wire)?;
    let room = req
        .query
        .get("room")
        .cloned()
        .unwrap_or_else(|| "default".to_string());
    let writer = SocketWriter::new(stream.try_clone()?);
    let peer_id = signaling.join_wire(&room, writer.clone(), wire);
    let result = read_socket(&mut stream, &writer, initial, wire, |value| {
        signaling.relay_value(&room, peer_id, &value)
    });
    signaling.leave(&room, peer_id);
    result
}

fn write_raw(stream: &mut TcpStream, raw: &str) -> std::io::Result<()> {
    stream.write_all(raw.as_bytes())
}

fn write_response(stream: &mut TcpStream, response: &Response) -> std::io::Result<()> {
    let reason = status_reason(response.status);
    let mut head = format!("HTTP/1.1 {} {reason}\r\n", response.status);
    let mut sent_len = false;
    let mut sent_conn = false;
    let mut sent_extra: HashMap<String, ()> = HashMap::new();
    for (k, v) in &response.headers {
        let lk = k.to_ascii_lowercase();
        if lk == "content-length" {
            sent_len = true;
        }
        if lk == "connection" {
            sent_conn = true;
        }
        sent_extra.insert(lk, ());
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    if !sent_len {
        head.push_str(&format!("content-length: {}\r\n", response.body.len()));
    }
    if !sent_conn {
        head.push_str("connection: close\r\n");
    }
    for (k, v) in security_headers() {
        if !sent_extra.contains_key(*k) {
            head.push_str(&format!("{k}: {v}\r\n"));
        }
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(&response.body)?;
    Ok(())
}

/// Hardening headers that match the Node server (`js/src/server/index.js`).
/// Loopback-only deployment keeps this conservative: no inline scripts,
/// no remote scripts, frame-ancestors none. Images may come from
/// `https://vk.com` so VK greeting-sticker previews (issue #35) load
/// without storing any artwork locally.
pub fn security_headers() -> &'static [(&'static str, &'static str)] {
    &[
        (
            "content-security-policy",
            "default-src 'self'; \
             script-src 'self' 'wasm-unsafe-eval'; \
             style-src 'self'; \
             img-src 'self' data: blob: https://vk.com; \
             connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:*; \
             worker-src 'self'; \
             font-src 'self' data:; \
             object-src 'none'; \
             base-uri 'self'; \
             frame-ancestors 'none'",
        ),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "no-referrer"),
        ("x-frame-options", "DENY"),
    ]
}

fn status_reason(code: u16) -> &'static str {
    match code {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        301 => "Moved Permanently",
        302 => "Found",
        304 => "Not Modified",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        406 => "Not Acceptable",
        413 => "Content Too Large",
        415 => "Unsupported Media Type",
        421 => "Misdirected Request",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "OK",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disconnected_and_incoming_sync_queues_have_finite_byte_limits() {
        let sender = WsSender::default();
        let value = Value::Object([("body".into(), Value::String("x".repeat(512 * 1024)))].into());
        let mut inbox = SyncInbox::default();
        for _ in 0..7 {
            sender.broadcast(&value).unwrap();
            inbox.push(value.clone()).unwrap();
        }
        assert!(sender.broadcast(&value).is_err());
        assert!(inbox.push(value).is_err());
        sender.close();
        assert_eq!(sender.pending.lock().unwrap().bytes, 0);
    }

    #[test]
    fn parses_simple_request() {
        let raw = "GET /links?q=1 HTTP/1.1\r\nHost: a\r\nContent-Length: 0\r\n";
        let req = parse_request(raw).unwrap();
        assert_eq!(req.method, "GET");
        assert_eq!(req.path, "/links");
        assert_eq!(req.query.get("q").map(String::as_str), Some("1"));
        assert_eq!(req.headers.get("host").map(String::as_str), Some("a"));
    }

    #[test]
    fn upgrade_detection() {
        let raw = "GET /ws HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: x\r\n";
        let req = parse_request(raw).unwrap();
        assert!(is_websocket_upgrade(&req));
    }
}
