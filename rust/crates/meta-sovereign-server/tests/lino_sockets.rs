use meta_sovereign_server::json::{self, Value};
use meta_sovereign_server::wire::{
    Format,
    socket::{BINARY_PROTOCOL, JSON_PROTOCOL, TEXT_PROTOCOL},
};
use meta_sovereign_server::ws::{Frame, FrameReader};
use meta_sovereign_server::{ServerOptions, serve};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

fn masked(opcode: u8, fin: bool, payload: &[u8]) -> Vec<u8> {
    let mut bytes = vec![opcode | if fin { 0x80 } else { 0 }];
    if payload.len() < 126 {
        bytes.push(0x80 | payload.len() as u8);
    } else {
        bytes.push(0x80 | 126);
        bytes.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    }
    let mask = [1, 2, 3, 4];
    bytes.extend_from_slice(&mask);
    bytes.extend(
        payload
            .iter()
            .enumerate()
            .map(|(i, byte)| byte ^ mask[i % 4]),
    );
    bytes
}

fn handshake(port: u16, path: &str, protocol: &str) -> (TcpStream, String) {
    handshake_with_initial(port, path, protocol, &[])
}

fn handshake_with_initial(
    port: u16,
    path: &str,
    protocol: &str,
    initial: &[u8],
) -> (TcpStream, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let offered = if protocol.is_empty() {
        String::new()
    } else {
        format!("Sec-WebSocket-Protocol: {protocol}\r\n")
    };
    let mut bytes = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n{offered}\r\n").into_bytes();
    bytes.extend_from_slice(initial);
    stream.write_all(&bytes).unwrap();
    let mut bytes = Vec::new();
    let mut byte = [0];
    while !bytes.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).unwrap();
        bytes.push(byte[0]);
        assert!(bytes.len() < 8192);
    }
    (stream, String::from_utf8(bytes).unwrap())
}

#[test]
fn absent_protocol_defaults_to_lino_and_upgrade_keeps_coalesced_first_frame() {
    let server = serve(ServerOptions::default()).unwrap();
    let value = json::parse(r#"{"type":"put","value":[null]}"#).unwrap();
    let bytes = Format::Text.encode(&value).unwrap();
    let mut initial = masked(1, true, &bytes);
    initial.extend(masked(9, true, b"parsed"));
    let (mut socket, head) = handshake_with_initial(server.port(), "/ws", "", &initial);
    assert!(head.starts_with("HTTP/1.1 101"), "{head}");
    assert!(!head.contains("Sec-WebSocket-Protocol:"));
    assert_eq!(receive(&mut socket), Frame::Pong(b"parsed".to_vec()));
    assert_eq!(server.ws_drain(), vec![json::encode(&value)]);
    server.ws_broadcast(&json::encode(&value)).unwrap();
    assert_eq!(decode(receive(&mut socket), Format::Text), value);
    server.shutdown();
}

fn receive(stream: &mut TcpStream) -> Frame {
    let mut reader = FrameReader::new();
    let mut byte = [0];
    loop {
        stream.read_exact(&mut byte).unwrap();
        reader.push(&byte);
        if let Some(frame) = reader.next_frame() {
            return frame;
        }
    }
}

fn open(port: u16, path: &str, protocol: &str) -> TcpStream {
    let (mut stream, head) = handshake(port, path, protocol);
    assert!(head.starts_with("HTTP/1.1 101"), "{head}");
    assert!(head.contains(&format!("Sec-WebSocket-Protocol: {protocol}")));
    stream.write_all(&masked(9, true, b"ready")).unwrap();
    assert_eq!(receive(&mut stream), Frame::Pong(b"ready".to_vec()));
    stream
}

fn decode(frame: Frame, format: Format) -> Value {
    let bytes = match frame {
        Frame::Text(text) if format != Format::Binary => text.into_bytes(),
        Frame::Binary(bytes) if format == Format::Binary => bytes,
        other => panic!("unexpected frame {other:?}"),
    };
    format.decode(&bytes).unwrap()
}

#[test]
fn native_sync_negotiates_both_representations_and_preserves_fragmented_unicode() {
    let server = serve(ServerOptions::default()).unwrap();
    let mut text = open(server.port(), "/ws", TEXT_PROTOCOL);
    let mut binary = open(server.port(), "/ws", BINARY_PROTOCOL);
    let value = json::parse(
        r#"{"type":"put","value":{"text":"🚀 你好\r\nПривет","empty":{},"array":[true,null,[]]}}"#,
    )
    .unwrap();
    server.ws_broadcast(&json::encode(&value)).unwrap();
    assert_eq!(decode(receive(&mut text), Format::Text), value);
    assert_eq!(decode(receive(&mut binary), Format::Binary), value);
    let bytes = Format::Text.encode(&value).unwrap();
    let split = bytes.iter().position(|x| *x == 0xf0).unwrap() + 2;
    text.write_all(&masked(1, false, &bytes[..split])).unwrap();
    text.write_all(&masked(9, true, b"between")).unwrap();
    assert_eq!(receive(&mut text), Frame::Pong(b"between".to_vec()));
    text.write_all(&masked(0, true, &bytes[split..])).unwrap();
    binary
        .write_all(&masked(2, true, &Format::Binary.encode(&value).unwrap()))
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut seen = Vec::new();
    while seen.len() < 2 {
        seen.extend(server.ws_drain());
        assert!(Instant::now() < deadline, "missing inbound values");
        std::thread::sleep(Duration::from_millis(2));
    }
    for event in seen {
        assert_eq!(json::parse(&event).unwrap(), value);
    }
    // A representation mismatch closes the connection, with no JSON guessing.
    text.write_all(&masked(2, true, b"{}")).unwrap();
    assert_eq!(receive(&mut text), Frame::Close);
    server.shutdown();
}

#[test]
fn signaling_reencodes_announcements_and_offers_for_each_room_peer() {
    let server = serve(ServerOptions::default()).unwrap();
    let mut text = open(server.port(), "/rtc?room=one", TEXT_PROTOCOL);
    let mut binary = open(server.port(), "/rtc?room=one", BINARY_PROTOCOL);
    let mut isolated = open(server.port(), "/rtc?room=two", TEXT_PROTOCOL);
    assert_eq!(
        decode(receive(&mut text), Format::Text)
            .get("type")
            .unwrap()
            .as_str(),
        Some("peer-joined")
    );
    let offer = json::parse(r#"{"type":"offer","sdp":"fake fixture 🚀","single":[true]}"#).unwrap();
    binary
        .write_all(&masked(2, true, &Format::Binary.encode(&offer).unwrap()))
        .unwrap();
    assert_eq!(decode(receive(&mut text), Format::Text), offer);
    text.write_all(&masked(1, true, &Format::Text.encode(&offer).unwrap()))
        .unwrap();
    assert_eq!(decode(receive(&mut binary), Format::Binary), offer);
    isolated
        .set_read_timeout(Some(Duration::from_millis(50)))
        .unwrap();
    assert!(isolated.read(&mut [0]).is_err());
    server.shutdown();
}

#[test]
fn json_socket_protocol_requires_explicit_compatibility() {
    let server = serve(ServerOptions::default()).unwrap();
    let (_, head) = handshake(server.port(), "/ws", JSON_PROTOCOL);
    assert!(head.starts_with("HTTP/1.1 406"));
    server.shutdown();
    let server = serve(ServerOptions {
        json_compatibility: true,
        ..Default::default()
    })
    .unwrap();
    let mut socket = open(server.port(), "/ws", JSON_PROTOCOL);
    server.ws_broadcast(r#"{"type":"fixture"}"#).unwrap();
    assert_eq!(
        decode(receive(&mut socket), Format::Json),
        json::parse(r#"{"type":"fixture"}"#).unwrap()
    );
    server.shutdown();
}
