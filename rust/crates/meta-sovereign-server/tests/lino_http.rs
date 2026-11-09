use meta_sovereign_server::json::{self, Value};
use meta_sovereign_server::wire::Format;
use meta_sovereign_server::{ServerOptions, serve};
use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream};
use std::time::Duration;

struct Reply {
    status: u16,
    headers: String,
    body: Vec<u8>,
}

fn request(port: u16, path: &str, headers: &str, body: &[u8], length: usize) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let method = if path == "/links" && length > 0 {
        "PUT"
    } else {
        "GET"
    };
    write!(stream, "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: {length}\r\n{headers}\r\n").unwrap();
    stream.write_all(body).unwrap();
    stream.shutdown(Shutdown::Write).unwrap();
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).unwrap();
    let offset = bytes.windows(4).position(|x| x == b"\r\n\r\n").unwrap();
    let headers = String::from_utf8(bytes[..offset].to_vec()).unwrap();
    let status = headers.split_whitespace().nth(1).unwrap().parse().unwrap();
    Reply {
        status,
        headers,
        body: bytes[offset + 4..].to_vec(),
    }
}

#[test]
fn default_http_uses_lino_and_all_four_representations_round_trip() {
    let server = serve(ServerOptions::default()).unwrap();
    let reply = request(server.port(), "/api/status", "", &[], 0);
    assert_eq!(reply.status, 200);
    assert!(
        reply.headers.contains("content-type: text/lino"),
        "{}",
        reply.headers
    );
    assert_eq!(
        Format::Text
            .decode(&reply.body)
            .unwrap()
            .get("service")
            .unwrap()
            .as_str(),
        Some("meta-sovereign")
    );
    let value = json::parse(r#"{"id":"fixture:🚀","text":"Привет\r\n100%","empty":{},"flags":[true,false,null],"number":1.25}"#).unwrap();
    for format in [Format::Text, Format::Binary, Format::Line, Format::Compact] {
        let body = format.encode(&value).unwrap();
        let headers = format!(
            "Content-Type: {}\r\nAccept: {}\r\n",
            format.media(),
            format.media()
        );
        let reply = request(server.port(), "/links", &headers, &body, body.len());
        assert_eq!(reply.status, 200, "{format:?}");
        assert!(
            reply
                .headers
                .contains(&format!("content-type: {}", format.media()))
        );
        assert_eq!(format.decode(&reply.body).unwrap(), value);
    }
    server.shutdown();
}

#[test]
fn media_failures_and_incomplete_bodies_never_mutate_the_store() {
    let server = serve(ServerOptions::default()).unwrap();
    for (headers, body, length, status) in [
        (
            "Content-Type: application/json\r\n",
            b"{\"id\":\"bad\"}".as_slice(),
            12,
            415,
        ),
        ("Content-Type: text/lino\r\n", b"\xff".as_slice(), 1, 400),
        ("Content-Type: text/lino\r\n", b"()".as_slice(), 30, 400),
        (
            "Content-Type: text/lino\r\n",
            b"".as_slice(),
            16 * 1024 * 1024 + 1,
            413,
        ),
        ("Accept: application/json\r\n", b"".as_slice(), 0, 406),
        (
            "Accept: text/lino;q=0, */*;q=0.5\r\n",
            b"".as_slice(),
            0,
            200,
        ),
    ] {
        let reply = request(server.port(), "/links", headers, body, length);
        assert_eq!(reply.status, status, "{headers}");
        let format = if headers.starts_with("Accept: text/lino;q=0") {
            Format::Binary
        } else {
            Format::Text
        };
        format.decode(&reply.body).unwrap();
    }
    assert_eq!(server.state().query(), Vec::<Value>::new());
    server.shutdown();
}

#[test]
fn early_rejections_preserve_the_response_with_unread_request_data() {
    let server = serve(ServerOptions::default()).unwrap();
    // Exceed read_head's buffer without approaching the request body limit.
    // Closing with these bytes unread used to reset the TCP connection.
    let body = vec![b'x'; 64 * 1024];
    for (headers, length, status) in [
        ("Content-Type: application/json\r\n", body.len(), 415),
        (
            "Content-Type: text/lino\r\nAccept: application/json\r\n",
            body.len(),
            406,
        ),
        ("Content-Type: text/lino\r\n", 16 * 1024 * 1024 + 1, 413),
        (
            "Content-Type: text/lino\r\nTransfer-Encoding: chunked\r\n",
            body.len(),
            400,
        ),
        (
            "Content-Type: text/lino\r\nOrigin: https://invalid.example\r\n",
            body.len(),
            403,
        ),
        (
            "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Protocol: unsupported\r\n",
            body.len(),
            406,
        ),
    ] {
        let reply = request(server.port(), "/links", headers, &body, length);
        assert_eq!(reply.status, status, "{headers}");
        Format::Text.decode(&reply.body).unwrap();
    }
    assert_eq!(server.state().query(), Vec::<Value>::new());
    server.shutdown();
}

#[test]
fn http_json_requires_opt_in_and_explicit_lino_still_wins() {
    let server = serve(ServerOptions {
        json_compatibility: true,
        ..Default::default()
    })
    .unwrap();
    let body = br#"{"id":"legacy","single":[null]}"#;
    let reply = request(
        server.port(),
        "/links",
        "Content-Type: application/json\r\n",
        body,
        body.len(),
    );
    assert_eq!(reply.status, 200);
    assert!(reply.headers.contains("content-type: application/json"));
    assert_eq!(
        Format::Json.decode(&reply.body).unwrap(),
        json::parse(std::str::from_utf8(body).unwrap()).unwrap()
    );
    let reply = request(server.port(), "/links", "Accept: text/lino\r\n", &[], 0);
    assert_eq!(reply.status, 200);
    assert!(reply.headers.contains("content-type: text/lino"));
    Format::Text.decode(&reply.body).unwrap();
    server.shutdown();
}
