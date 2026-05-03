//! WebRTC signalling broker — Rust mirror of
//! `js/src/sync/webrtc-signaling.js`.
//!
//! The broker fans every text frame to every other peer in the same
//! room, and announces fresh peers with a `peer-joined` message so
//! existing peers can initiate an offer. Holds zero application
//! state — losing it just means new peers can't find each other
//! until restart.

use std::collections::HashMap;
use std::io::Write;
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ws::encode_text_frame;

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
    socket: TcpStream,
}

impl Signaling {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn join(&self, room: &str, socket: TcpStream) -> u64 {
        let mut g = self.inner.lock().expect("signaling poisoned");
        g.next_id += 1;
        let id = g.next_id;
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let announce = encode_text_frame(&format!(
            "{{\"type\":\"peer-joined\",\"peerId\":\"{nanos}-{id:x}\"}}"
        ));
        let entry = g.rooms.entry(room.to_string()).or_default();
        for other in entry.iter_mut() {
            let _ = other.socket.write_all(&announce);
        }
        let cloned = match socket.try_clone() {
            Ok(s) => s,
            Err(_) => return id,
        };
        entry.push(Peer { id, socket: cloned });
        id
    }

    pub fn relay(&self, room: &str, peer_id: u64, text: &str) {
        let mut g = self.inner.lock().expect("signaling poisoned");
        let frame = encode_text_frame(text);
        if let Some(peers) = g.rooms.get_mut(room) {
            for p in peers.iter_mut() {
                if p.id != peer_id {
                    let _ = p.socket.write_all(&frame);
                }
            }
        }
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
