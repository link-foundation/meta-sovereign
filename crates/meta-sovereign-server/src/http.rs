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
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::handlers;
use crate::routes::{dispatch, StaticRoot};
use crate::signaling::Signaling;
use crate::state::ServerState;
use crate::ws::{accept_key, encode_pong_frame, encode_text_frame, Frame, FrameReader};

const MAX_HEAD_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;

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

#[derive(Default, Clone)]
pub struct ServerOptions {
    pub port: u16,
    pub static_root: Option<PathBuf>,
}

pub struct ServerHandle {
    addr: SocketAddr,
    stop: Arc<AtomicBool>,
    state: Arc<ServerState>,
    sync_peers: Arc<AtomicUsize>,
    signaling: Signaling,
    ws_outgoing: WsSender,
    ws_incoming: Arc<Mutex<Vec<String>>>,
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
        self.sync_peers.load(Ordering::SeqCst)
    }
    /// Send a sync event to every connected /ws peer.
    pub fn ws_broadcast(&self, text: &str) {
        self.ws_outgoing.broadcast(text);
    }
    /// Drain JSON sync events received from /ws clients.
    pub fn ws_drain(&self) -> Vec<String> {
        let mut g = self.ws_incoming.lock().expect("incoming poisoned");
        std::mem::take(&mut *g)
    }
    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::SeqCst);
        // Wake the accept loop with a connect.
        let _ = TcpStream::connect(self.addr);
    }
}

#[derive(Clone, Default)]
struct WsSender {
    sockets: Arc<Mutex<Vec<TcpStream>>>,
    pending: Arc<Mutex<Vec<String>>>,
}

impl WsSender {
    fn add(&self, s: TcpStream) {
        let mut g = self.sockets.lock().expect("ws sockets poisoned");
        g.push(s);
        let mut p = self.pending.lock().expect("ws pending poisoned");
        let pending = std::mem::take(&mut *p);
        drop(p);
        if !pending.is_empty() {
            let last = g.last_mut().expect("just pushed");
            for text in pending {
                let frame = encode_text_frame(&text);
                let _ = last.write_all(&frame);
            }
        }
    }
    fn drop_socket(&self, target: &TcpStream) {
        let mut g = self.sockets.lock().expect("ws sockets poisoned");
        let target_addr = target.peer_addr().ok();
        g.retain(|s| s.peer_addr().ok() != target_addr);
    }
    fn broadcast(&self, text: &str) {
        let mut g = self.sockets.lock().expect("ws sockets poisoned");
        if g.is_empty() {
            self.pending
                .lock()
                .expect("ws pending poisoned")
                .push(text.to_string());
            return;
        }
        let frame = encode_text_frame(text);
        let mut dead = Vec::new();
        for (i, s) in g.iter_mut().enumerate() {
            if s.write_all(&frame).is_err() {
                dead.push(i);
            }
        }
        for i in dead.into_iter().rev() {
            g.remove(i);
        }
    }
    fn count(&self) -> usize {
        self.sockets.lock().expect("ws sockets poisoned").len()
    }
}

pub fn serve(opts: ServerOptions) -> std::io::Result<ServerHandle> {
    let listener = TcpListener::bind(("127.0.0.1", opts.port))?;
    let addr = listener.local_addr()?;
    let stop = Arc::new(AtomicBool::new(false));
    let state = Arc::new(ServerState::new());
    let static_root = Arc::new(StaticRoot::new(opts.static_root.clone()));
    let signaling = Signaling::new();
    let sync_peers = Arc::new(AtomicUsize::new(0));
    let ws_outgoing = WsSender::default();
    let ws_incoming = Arc::new(Mutex::new(Vec::new()));

    let stop_l = Arc::clone(&stop);
    let state_l = Arc::clone(&state);
    let static_l = Arc::clone(&static_root);
    let signaling_l = signaling.clone();
    let peers_l = Arc::clone(&sync_peers);
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
                let state = Arc::clone(&state_l);
                let root = Arc::clone(&static_l);
                let sig = signaling_l.clone();
                let peers = Arc::clone(&peers_l);
                let ws_out = ws_out_l.clone();
                let ws_in = Arc::clone(&ws_in_l);
                thread::spawn(move || {
                    let _ = handle_connection(stream, state, root, sig, peers, ws_out, ws_in);
                });
            }
        })?;
    sync_peers.store(ws_outgoing.count(), Ordering::SeqCst);

    Ok(ServerHandle {
        addr,
        stop,
        state,
        sync_peers,
        signaling,
        ws_outgoing,
        ws_incoming,
    })
}

fn handle_connection(
    mut stream: TcpStream,
    state: Arc<ServerState>,
    root: Arc<StaticRoot>,
    signaling: Signaling,
    sync_peers: Arc<AtomicUsize>,
    ws_outgoing: WsSender,
    ws_incoming: Arc<Mutex<Vec<String>>>,
) -> std::io::Result<()> {
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
                &Response::json(400, "{\"error\":\"bad request\"}"),
            );
            return Ok(());
        }
    };

    if is_websocket_upgrade(&parsed) {
        if parsed.path == "/ws" {
            return upgrade_ws(stream, &parsed, sync_peers, ws_outgoing, ws_incoming);
        }
        if parsed.path == "/rtc" {
            return upgrade_rtc(stream, &parsed, signaling);
        }
        let _ = write_raw(
            &mut stream,
            "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n",
        );
        return Ok(());
    }

    let mut req = parsed;
    let need = content_length(&req.headers).unwrap_or(0);
    let mut body = leftover;
    while body.len() < need && body.len() < MAX_BODY_BYTES {
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf)?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&buf[..n]);
    }
    body.truncate(need.min(MAX_BODY_BYTES));
    req.body = body;

    let response = dispatch(&state, &root, &req);
    write_response(&mut stream, &response)?;
    Ok(())
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
            let head = String::from_utf8_lossy(&buf[..idx]).into_owned();
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

fn write_handshake(stream: &mut TcpStream, req: &Request) -> std::io::Result<()> {
    let key = req
        .headers
        .get("sec-websocket-key")
        .map(String::as_str)
        .unwrap_or("");
    let accept = accept_key(key);
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
    );
    stream.write_all(resp.as_bytes())
}

fn upgrade_ws(
    mut stream: TcpStream,
    req: &Request,
    sync_peers: Arc<AtomicUsize>,
    ws_outgoing: WsSender,
    ws_incoming: Arc<Mutex<Vec<String>>>,
) -> std::io::Result<()> {
    write_handshake(&mut stream, req)?;
    let writer = stream.try_clone()?;
    ws_outgoing.add(writer);
    sync_peers.store(ws_outgoing.count(), Ordering::SeqCst);

    let mut reader = FrameReader::new();
    let mut chunk = [0u8; 4096];
    let _ = stream.set_read_timeout(None);
    loop {
        let n = match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        reader.push(&chunk[..n]);
        loop {
            match reader.next_frame() {
                Some(Frame::Text(t)) => {
                    ws_incoming.lock().expect("incoming poisoned").push(t);
                }
                Some(Frame::Ping(_)) => {
                    let _ = stream.write_all(&encode_pong_frame());
                }
                Some(Frame::Pong(_)) => {}
                Some(Frame::Close) => {
                    let _ = stream.shutdown(Shutdown::Both);
                    ws_outgoing.drop_socket(&stream);
                    sync_peers.store(ws_outgoing.count(), Ordering::SeqCst);
                    return Ok(());
                }
                None => break,
            }
        }
    }
    ws_outgoing.drop_socket(&stream);
    sync_peers.store(ws_outgoing.count(), Ordering::SeqCst);
    Ok(())
}

fn upgrade_rtc(mut stream: TcpStream, req: &Request, signaling: Signaling) -> std::io::Result<()> {
    write_handshake(&mut stream, req)?;
    let room = req
        .query
        .get("room")
        .cloned()
        .unwrap_or_else(|| "default".to_string());
    let writer = stream.try_clone()?;
    let peer_id = signaling.join(&room, writer);
    let mut reader = FrameReader::new();
    let mut chunk = [0u8; 4096];
    let _ = stream.set_read_timeout(None);
    loop {
        let n = match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        reader.push(&chunk[..n]);
        loop {
            match reader.next_frame() {
                Some(Frame::Text(t)) => signaling.relay(&room, peer_id, &t),
                Some(Frame::Ping(_)) => {
                    let _ = stream.write_all(&encode_pong_frame());
                }
                Some(Frame::Pong(_)) => {}
                Some(Frame::Close) => {
                    signaling.leave(&room, peer_id);
                    let _ = stream.shutdown(Shutdown::Both);
                    return Ok(());
                }
                None => break,
            }
        }
    }
    signaling.leave(&room, peer_id);
    Ok(())
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
    if !sent_extra.contains_key("access-control-allow-origin") {
        head.push_str("access-control-allow-origin: *\r\n");
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(&response.body)?;
    Ok(())
}

fn status_reason(code: u16) -> &'static str {
    match code {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        301 => "Moved Permanently",
        304 => "Not Modified",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        500 => "Internal Server Error",
        _ => "OK",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
