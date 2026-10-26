//! End-to-end checks that prove the Rust server speaks the same wire
//! protocol the SPA expects. We boot the server on a random port,
//! drive raw TCP requests against it, and assert the responses match
//! what `js/src/web/discover.js` and the SPA route layer expect.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use meta_sovereign_server::{serve, ServerOptions};

fn read_until_close(stream: &mut TcpStream) -> String {
    let mut out = Vec::new();
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 4096];
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => out.extend_from_slice(&buf[..n]),
            Err(_) => break,
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn http_request(port: u16, raw: &str) -> String {
    let mut s = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    let request = raw.replace("Host: x\r\n", &format!("Host: 127.0.0.1:{port}\r\n"));
    s.write_all(request.as_bytes()).expect("write");
    read_until_close(&mut s)
}

fn body_of(resp: &str) -> &str {
    if let Some(idx) = resp.find("\r\n\r\n") {
        &resp[idx + 4..]
    } else {
        ""
    }
}

#[test]
fn local_server_boundary_restricts_http_and_socket_origins() {
    let h = serve(ServerOptions::default()).expect("serve");
    let pages = "https://link-foundation.github.io";
    let allowed = http_request(
        h.port(),
        &format!("GET /api/status HTTP/1.1\r\nHost: x\r\nOrigin: {pages}\r\n\r\n"),
    );
    assert!(allowed.starts_with("HTTP/1.1 200"));
    assert!(allowed.contains(&format!("access-control-allow-origin: {pages}")));
    assert!(!allowed.contains("access-control-allow-origin: *"));
    for origin in ["https://evil.example", "https://evil.github.io", "null"] {
        for route in ["/api/status", "/links", "/ws", "/rtc"] {
            let request = format!("GET {route} HTTP/1.1\r\nHost: x\r\nOrigin: {origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
            assert!(http_request(h.port(), &request).starts_with("HTTP/1.1 403"));
        }
    }
    let rebound = http_request(
        h.port(),
        "GET /api/status HTTP/1.1\r\nHost: evil.example\r\n\r\n",
    );
    assert!(rebound.starts_with("HTTP/1.1 421"));
    let preflight = http_request(h.port(), &format!("OPTIONS /links HTTP/1.1\r\nHost: x\r\nOrigin: {pages}\r\nAccess-Control-Request-Method: PUT\r\nAccess-Control-Request-Headers: content-type\r\nAccess-Control-Request-Private-Network: true\r\n\r\n"));
    assert!(preflight.starts_with("HTTP/1.1 204"));
    assert!(preflight.contains("access-control-allow-private-network: true"));
    let root = http_request(h.port(), "GET / HTTP/1.1\r\nHost: x\r\n\r\n");
    assert!(root.starts_with("HTTP/1.1 302"));
    assert!(root.contains("location: https://link-foundation.github.io/meta-sovereign/"));
    h.shutdown();
}

#[test]
fn sources_endpoint_lists_known_networks() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let resp = http_request(
        h.port(),
        "GET /sources HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(resp.starts_with("HTTP/1.1 200"), "{resp}");
    let body = body_of(&resp);
    for src in [
        "telegram",
        "vk",
        "x",
        "whatsapp",
        "facebook",
        "linkedin",
        "habr-career",
        "hh",
        "superjob",
        "email",
        "github",
        "upwork",
        "peopleperhour",
    ] {
        assert!(body.contains(src), "missing {src} in {body}");
    }
    h.shutdown();
}

#[test]
fn status_endpoint_returns_object_for_discover() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let resp = http_request(
        h.port(),
        "GET /api/status HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(resp.starts_with("HTTP/1.1 200"));
    let body = body_of(&resp);
    assert!(body.contains("\"links\":0"));
    assert!(body.contains("\"messages\":0"));
    h.shutdown();
}

#[test]
fn put_link_then_get_round_trips() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let body = "{\"id\":\"msg:t:1\",\"tokens\":[\"message\"],\"sender\":\"me\",\"source\":\"t\",\"chat\":\"c\",\"body\":\"hi\",\"timestamp\":\"2024-01-01\"}";
    let put = format!(
        "PUT /links HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let put_resp = http_request(h.port(), &put);
    assert!(put_resp.starts_with("HTTP/1.1 200"), "{put_resp}");
    let get = "GET /links HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let get_resp = http_request(h.port(), get);
    let get_body = body_of(&get_resp);
    assert!(get_body.contains("msg:t:1"));
    let status = http_request(
        h.port(),
        "GET /api/status HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(body_of(&status).contains("\"messages\":1"));
    h.shutdown();
}

#[test]
fn pattern_infer_returns_regex_and_flags() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let body = "{\"examples\":[\"hi a\",\"hi b\"]}";
    let req = format!(
        "POST /api/patterns/infer HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let resp = http_request(h.port(), &req);
    let resp_body = body_of(&resp);
    assert!(resp_body.contains("\"flags\":\"i\""));
    assert!(resp_body.contains("\"regex\":"));
    h.shutdown();
}

#[test]
fn email_pull_imports_and_send_queues_over_http() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let pull_body = r#"{"protocol":"gmail","provider":"google","messages":[
        {"externalId":"net-1","sender":"a@x.com","chat":"t","body":"hi"}
    ]}"#;
    let pull = format!(
        "POST /api/email/pull HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        pull_body.len(),
        pull_body
    );
    let pull_resp = http_request(h.port(), &pull);
    assert!(pull_resp.starts_with("HTTP/1.1 200"), "{pull_resp}");
    let pb = body_of(&pull_resp);
    assert!(pb.contains("\"imported\":1"), "{pb}");
    assert!(pb.contains("\"source\":\"email\""));

    // Stored msg link is fetchable through /links/<id>.
    let get = http_request(
        h.port(),
        "GET /links/msg%3Aemail%3Anet-1 HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(body_of(&get).contains("\"body\":\"hi\""), "{get}");

    let send_body = r#"{"protocol":"gmail","message":{"to":"b@x.com","subject":"S","text":"T"}}"#;
    let send = format!(
        "POST /api/email/send HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        send_body.len(),
        send_body
    );
    let send_resp = http_request(h.port(), &send);
    let sb = body_of(&send_resp);
    assert!(sb.contains("\"status\":\"queued\""), "{sb}");
    h.shutdown();
}

#[test]
fn unknown_route_returns_404() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let resp = http_request(
        h.port(),
        "GET /no/such HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(resp.starts_with("HTTP/1.1 404"));
    h.shutdown();
}

#[test]
fn websocket_handshake_succeeds_on_ws_path() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let mut s = TcpStream::connect(("127.0.0.1", h.port())).expect("connect");
    let req = "GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
    s.write_all(
        req.replace("Host: x\r\n", &format!("Host: 127.0.0.1:{}\r\n", h.port()))
            .as_bytes(),
    )
    .unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let mut buf = [0u8; 1024];
    let mut acc = Vec::new();
    while !acc.windows(4).any(|w| w == b"\r\n\r\n") {
        let n = s.read(&mut buf).unwrap();
        if n == 0 {
            break;
        }
        acc.extend_from_slice(&buf[..n]);
    }
    let head = String::from_utf8_lossy(&acc);
    assert!(head.starts_with("HTTP/1.1 101"), "{head}");
    assert!(head.contains("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="));
    h.shutdown();
}

#[test]
fn webrtc_signaling_relays_between_two_peers() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let mut a = open_ws(h.port(), "/rtc?room=test");
    let mut b = open_ws(h.port(), "/rtc?room=test");
    // The server adds a peer to the room just after its handshake, so
    // either may be in it first: the one already there hears "peer-joined"
    // about the other. Once one has, both are in the room.
    let (joined, _) = first_text_frame(&mut a, &mut b);
    assert!(
        joined.contains("peer-joined"),
        "expected peer-joined, got {joined:?}"
    );
    // a sends an offer; b receives it.
    write_text_frame(&mut a, "{\"type\":\"offer\",\"sdp\":\"x\"}");
    b.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let relayed = read_one_text_frame(&mut b);
    assert!(relayed.contains("\"type\":\"offer\""), "got {relayed:?}");
    h.shutdown();
}

fn open_ws(port: u16, path: &str) -> TcpStream {
    let mut s = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    let key = "dGhlIHNhbXBsZSBub25jZQ==";
    let req = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    );
    s.write_all(req.as_bytes()).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    // One byte at a time: a frame right behind the handshake stays unread.
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    while !buf.ends_with(b"\r\n\r\n") {
        if s.read(&mut byte).unwrap() == 0 {
            break;
        }
        buf.push(byte[0]);
    }
    s
}

// The first text frame either stream receives, and which one (0 = a).
fn first_text_frame(a: &mut TcpStream, b: &mut TcpStream) -> (String, usize) {
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    a.set_nonblocking(true).unwrap();
    b.set_nonblocking(true).unwrap();
    let mut probe = [0u8; 1];
    let has_data = |s: &TcpStream, probe: &mut [u8; 1]| matches!(s.peek(probe), Ok(n) if n > 0);
    let which = loop {
        if has_data(a, &mut probe) {
            break 0;
        }
        if has_data(b, &mut probe) {
            break 1;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "no frame on either peer"
        );
        std::thread::sleep(Duration::from_millis(10));
    };
    a.set_nonblocking(false).unwrap();
    b.set_nonblocking(false).unwrap();
    let s = if which == 0 { a } else { b };
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    (read_one_text_frame(s), which)
}

fn write_text_frame(stream: &mut TcpStream, text: &str) {
    let payload = text.as_bytes();
    let len = payload.len();
    let mask = [0x12u8, 0x34, 0x56, 0x78];
    let mut frame = Vec::new();
    frame.push(0x81);
    if len < 126 {
        frame.push(0x80 | (len as u8));
    } else {
        frame.push(0x80 | 126);
        frame.push(((len >> 8) & 0xff) as u8);
        frame.push((len & 0xff) as u8);
    }
    frame.extend_from_slice(&mask);
    for (i, b) in payload.iter().enumerate() {
        frame.push(b ^ mask[i % 4]);
    }
    stream.write_all(&frame).unwrap();
}

fn read_one_text_frame(stream: &mut TcpStream) -> String {
    let mut head = [0u8; 2];
    stream.read_exact(&mut head).unwrap();
    let opcode = head[0] & 0x0f;
    assert_eq!(opcode, 0x1, "expected text frame, got opcode {opcode:x}");
    let masked = (head[1] & 0x80) != 0;
    let short = (head[1] & 0x7f) as usize;
    let len = if short < 126 {
        short
    } else if short == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext).unwrap();
        ((ext[0] as usize) << 8) | ext[1] as usize
    } else {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext).unwrap();
        u64::from_be_bytes(ext) as usize
    };
    let mask = if masked {
        let mut m = [0u8; 4];
        stream.read_exact(&mut m).unwrap();
        Some(m)
    } else {
        None
    };
    let mut payload = vec![0u8; len];
    stream.read_exact(&mut payload).unwrap();
    if let Some(m) = mask {
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= m[i % 4];
        }
    }
    String::from_utf8_lossy(&payload).into_owned()
}

#[test]
fn ws_broadcast_sends_to_connected_peer() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let mut s = open_ws(h.port(), "/ws");
    // Give the server a moment to register the socket.
    std::thread::sleep(Duration::from_millis(150));
    h.ws_broadcast("{\"hello\":\"world\"}");
    let frame = read_one_text_frame(&mut s);
    assert_eq!(frame, "{\"hello\":\"world\"}");
    h.shutdown();
}

#[test]
fn ws_drain_collects_inbound_frames() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let mut s = open_ws(h.port(), "/ws");
    write_text_frame(&mut s, "{\"from\":\"client\"}");
    std::thread::sleep(Duration::from_millis(150));
    let drained = h.ws_drain();
    assert!(
        drained.iter().any(|t| t.contains("from")),
        "got {drained:?}"
    );
    h.shutdown();
}

#[test]
fn static_serve_returns_index_when_root_is_set() {
    let dir = tempdir();
    std::fs::write(dir.join("index.html"), b"<html>hi</html>").unwrap();
    std::fs::write(dir.join("app.js"), b"console.log(1)").unwrap();
    let h = serve(ServerOptions {
        port: 0,
        static_root: Some(dir.clone()),
        ..Default::default()
    })
    .expect("serve");
    let resp = http_request(
        h.port(),
        "GET / HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(resp.contains("<html>hi</html>"), "{resp}");
    let resp = http_request(
        h.port(),
        "GET /app.js HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(resp.contains("console.log(1)"), "{resp}");
    h.shutdown();
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn responses_include_csp_and_hardening_headers() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let resp = http_request(
        h.port(),
        "GET /sources HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    let lower = resp.to_ascii_lowercase();
    assert!(
        lower.contains("content-security-policy: default-src 'self'"),
        "missing CSP: {resp}"
    );
    assert!(
        lower.contains("x-content-type-options: nosniff"),
        "missing nosniff: {resp}"
    );
    assert!(
        lower.contains("x-frame-options: deny"),
        "missing frame-options: {resp}"
    );
    assert!(
        lower.contains("referrer-policy: no-referrer"),
        "missing referrer-policy: {resp}"
    );
    h.shutdown();
}

#[test]
fn metrics_endpoint_emits_prometheus_exposition() {
    let h = serve(ServerOptions {
        port: 0,
        static_root: None,
        ..Default::default()
    })
    .expect("serve");
    let put = format!(
        "PUT /links HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        "{\"id\":\"msg:m1\",\"tokens\":[\"m\"]}".len(),
        "{\"id\":\"msg:m1\",\"tokens\":[\"m\"]}"
    );
    let _ = http_request(h.port(), &put);
    let resp = http_request(
        h.port(),
        "GET /metrics HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    assert!(resp.starts_with("HTTP/1.1 200"), "{resp}");
    let body = body_of(&resp);
    assert!(
        body.contains("# HELP meta_sovereign_links_total"),
        "missing HELP: {body}"
    );
    assert!(
        body.contains("# TYPE meta_sovereign_links_total gauge"),
        "missing TYPE: {body}"
    );
    assert!(
        body.contains("meta_sovereign_links_by_kind{kind=\"message\"} 1"),
        "wrong message count: {body}"
    );
    assert!(
        body.contains("meta_sovereign_ws_peers"),
        "missing ws_peers: {body}"
    );
    assert!(
        body.contains("meta_sovereign_rtc_rooms"),
        "missing rtc_rooms: {body}"
    );
    let lower = resp.to_ascii_lowercase();
    assert!(
        lower.contains("content-type: text/plain"),
        "metrics should be text/plain: {resp}"
    );
    h.shutdown();
}

fn tempdir() -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let p = std::env::temp_dir().join(format!("ms-rs-{nanos}"));
    std::fs::create_dir_all(&p).unwrap();
    p
}
