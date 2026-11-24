//! WebRTC signalling broker — Rust mirror of
//! `js/src/sync/webrtc-signaling.js`.
//!
//! The broker validates and reencodes typed values for every other peer's
//! negotiated format in the same room, and announces fresh peers so
//! existing peers can initiate an offer. Holds zero application
//! state — losing it just means new peers can't find each other
//! until restart.

use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::json::{self, Value};
use crate::wire::{
    Format,
    socket::{SocketWire, SocketWriter},
};

#[derive(Default, Clone)]
pub struct Signaling {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Default)]
struct Inner {
    rooms: HashMap<String, Vec<Peer>>,
    next_id: u64,
}

struct Peer {
    id: u64,
    socket: SocketWriter,
    wire: SocketWire,
}

impl Signaling {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn join(&self, room: &str, socket: TcpStream) -> u64 {
        self.join_wire(
            room,
            SocketWriter::new(socket),
            SocketWire::negotiate(None, false).unwrap(),
        )
    }

    pub(crate) fn join_wire(&self, room: &str, socket: SocketWriter, wire: SocketWire) -> u64 {
        let mut g = self.inner.lock().expect("signaling poisoned");
        g.next_id += 1;
        let id = g.next_id;
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let announce = json::parse(&format!(
            "{{\"type\":\"peer-joined\",\"peerId\":\"{nanos}-{id:x}\"}}"
        ))
        .expect("bounded peer announcement");
        let entry = g.rooms.entry(room.to_string()).or_default();
        entry.retain(|other| {
            if other
                .wire
                .frame(&announce)
                .and_then(|frame| other.socket.write(&frame))
                .is_err()
            {
                other.socket.shutdown();
                false
            } else {
                true
            }
        });
        entry.push(Peer { id, socket, wire });
        id
    }

    pub fn relay(&self, room: &str, peer_id: u64, text: &str) -> std::io::Result<()> {
        let value = Format::Json
            .decode(text.as_bytes())
            .map_err(std::io::Error::other)?;
        self.relay_value(room, peer_id, &value)
    }

    pub(crate) fn relay_value(
        &self,
        room: &str,
        peer_id: u64,
        value: &Value,
    ) -> std::io::Result<()> {
        let mut g = self.inner.lock().expect("signaling poisoned");
        if let Some(peers) = g.rooms.get_mut(room) {
            let mut frames = Vec::new();
            for peer in peers.iter().filter(|peer| peer.id != peer_id) {
                if !frames.iter().any(|(format, _)| *format == peer.wire.format) {
                    frames.push((peer.wire.format, peer.wire.frame(value)?));
                }
            }
            peers.retain(|peer| {
                if peer.id == peer_id {
                    return true;
                }
                let frame = &frames
                    .iter()
                    .find(|(format, _)| *format == peer.wire.format)
                    .unwrap()
                    .1;
                if peer.socket.write(frame).is_err() {
                    peer.socket.shutdown();
                    false
                } else {
                    true
                }
            });
        }
        Ok(())
    }

    pub fn close(&self) {
        let mut g = self.inner.lock().expect("signaling poisoned");
        for peers in g.rooms.values() {
            for peer in peers {
                peer.socket.shutdown();
            }
        }
        g.rooms.clear();
    }

    pub fn leave(&self, room: &str, peer_id: u64) {
        let mut g = self.inner.lock().expect("signaling poisoned");
        if let Some(peers) = g.rooms.get_mut(room) {
            peers.retain(|p| p.id != peer_id);
            if peers.is_empty() {
                g.rooms.remove(room);
            }
        }
    }

    #[allow(dead_code)]
    pub fn rooms(&self) -> Vec<String> {
        self.inner
            .lock()
            .expect("signaling poisoned")
            .rooms
            .keys()
            .cloned()
            .collect()
    }

    #[allow(dead_code)]
    pub fn peers(&self, room: &str) -> usize {
        self.inner
            .lock()
            .expect("signaling poisoned")
            .rooms
            .get(room)
            .map(|p| p.len())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_room_count_is_zero() {
        let s = Signaling::new();
        assert_eq!(s.peers("nope"), 0);
        assert_eq!(s.rooms().len(), 0);
    }
}
