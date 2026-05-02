//! RFC 6455 WebSocket framing — pure-`std` Rust mirror of
//! `src/sync/ws-frame.js`.
//!
//! Only the subset the SPA exercises is implemented:
//!   - single-fragment text frames up to 4 GiB,
//!   - server-side decode of masked client frames,
//!   - server-side encode of unmasked text frames,
//!   - close (0x8) and ping (0x9) opcodes (pong replies).
//!
//! Hand-rolled SHA-1 + Base64 keep the dependency surface at zero —
//! the handshake takes the client's `Sec-WebSocket-Key`, appends the
//! magic GUID, hashes, then base64-encodes the digest.

const GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/// Compute the `Sec-WebSocket-Accept` value for a given client key.
pub fn accept_key(client_key: &str) -> String {
    let mut input = String::with_capacity(client_key.len() + GUID.len());
    input.push_str(client_key);
    input.push_str(GUID);
    let digest = sha1(input.as_bytes());
    base64_encode(&digest)
}

/// Encode `text` as a single unmasked text frame (server -> client).
pub fn encode_text_frame(text: &str) -> Vec<u8> {
    let payload = text.as_bytes();
    let len = payload.len();
    let mut out = Vec::with_capacity(2 + 8 + len);
    out.push(0x81); // FIN + text opcode
    if len < 126 {
        out.push(len as u8);
    } else if len < 0x10000 {
        out.push(126);
        out.push(((len >> 8) & 0xff) as u8);
        out.push((len & 0xff) as u8);
    } else {
        out.push(127);
        let l64 = len as u64;
        for i in (0..8).rev() {
            out.push(((l64 >> (i * 8)) & 0xff) as u8);
        }
    }
    out.extend_from_slice(payload);
    out
}

/// Pong reply for a ping. Empty payload, no mask, FIN set.
pub fn encode_pong_frame() -> [u8; 2] {
    [0x8a, 0x00]
}

#[derive(Debug, Clone)]
pub enum Frame {
    Text(String),
    Ping(Vec<u8>),
    Pong(Vec<u8>),
    Close,
}

/// Streaming frame reader. Feed chunks of bytes via [`FrameReader::push`]
/// and call [`FrameReader::next_frame`] until it returns `None` to drain
/// all fully-received frames.
#[derive(Default)]
pub struct FrameReader {
    buf: Vec<u8>,
}

impl FrameReader {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &[u8]) {
        self.buf.extend_from_slice(chunk);
    }

    pub fn next_frame(&mut self) -> Option<Frame> {
        loop {
            if self.buf.len() < 2 {
                return None;
            }
            let opcode = self.buf[0] & 0x0f;
            let masked = (self.buf[1] & 0x80) != 0;
            let short_len = (self.buf[1] & 0x7f) as usize;
            let (payload_len, header_len) = if short_len < 126 {
                (short_len, 2usize)
            } else if short_len == 126 {
                if self.buf.len() < 4 {
                    return None;
                }
                let len = ((self.buf[2] as usize) << 8) | self.buf[3] as usize;
                (len, 4)
            } else {
                if self.buf.len() < 10 {
                    return None;
                }
                // We treat the upper 32 bits as zero; the SPA never
                // sends frames anywhere near 4 GiB.
                let len = ((self.buf[6] as usize) << 24)
                    | ((self.buf[7] as usize) << 16)
                    | ((self.buf[8] as usize) << 8)
                    | (self.buf[9] as usize);
                (len, 10)
            };
            let mask_len = if masked { 4 } else { 0 };
            let total = header_len + mask_len + payload_len;
            if self.buf.len() < total {
                return None;
            }
            let mut payload = vec![0u8; payload_len];
            if masked {
                let mask = &self.buf[header_len..header_len + 4];
                for (i, b) in self.buf[header_len + 4..header_len + 4 + payload_len]
                    .iter()
                    .enumerate()
                {
                    payload[i] = b ^ mask[i % 4];
                }
            } else {
                payload.copy_from_slice(&self.buf[header_len..header_len + payload_len]);
            }
            self.buf.drain(..total);
            match opcode {
                0x1 => {
                    let text = String::from_utf8_lossy(&payload).into_owned();
                    return Some(Frame::Text(text));
                }
                0x8 => return Some(Frame::Close),
                0x9 => return Some(Frame::Ping(payload)),
                0xA => return Some(Frame::Pong(payload)),
                // Continuations and other opcodes are not produced by
                // the SPA. Skip silently and look for the next frame.
                _ => continue,
            }
        }
    }
}

// -- SHA-1 ------------------------------------------------------------------

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    let bit_len = (data.len() as u64) * 8;
    let mut padded = Vec::with_capacity(data.len() + 9 + 64);
    padded.extend_from_slice(data);
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in padded.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let mut a = h0;
        let mut b = h1;
        let mut c = h2;
        let mut d = h3;
        let mut e = h4;
        for (i, &word) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(word);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }
        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }
    let mut out = [0u8; 20];
    out[0..4].copy_from_slice(&h0.to_be_bytes());
    out[4..8].copy_from_slice(&h1.to_be_bytes());
    out[8..12].copy_from_slice(&h2.to_be_bytes());
    out[12..16].copy_from_slice(&h3.to_be_bytes());
    out[16..20].copy_from_slice(&h4.to_be_bytes());
    out
}

// -- Base64 -----------------------------------------------------------------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | data[i + 2] as u32;
        out.push(B64[((n >> 18) & 0x3f) as usize] as char);
        out.push(B64[((n >> 12) & 0x3f) as usize] as char);
        out.push(B64[((n >> 6) & 0x3f) as usize] as char);
        out.push(B64[(n & 0x3f) as usize] as char);
        i += 3;
    }
    let rem = data.len() - i;
    if rem == 1 {
        let n = (data[i] as u32) << 16;
        out.push(B64[((n >> 18) & 0x3f) as usize] as char);
        out.push(B64[((n >> 12) & 0x3f) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
        out.push(B64[((n >> 18) & 0x3f) as usize] as char);
        out.push(B64[((n >> 12) & 0x3f) as usize] as char);
        out.push(B64[((n >> 6) & 0x3f) as usize] as char);
        out.push('=');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_accept_key() {
        // RFC 6455 §1.3 example.
        assert_eq!(
            accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }

    #[test]
    fn round_trip_short_frame() {
        let text = "hello";
        let frame = encode_text_frame(text);
        // Mask the payload as a client would.
        let mask = [0x12u8, 0x34, 0x56, 0x78];
        let payload = text.as_bytes();
        let mut masked = vec![0x81u8, 0x80 | payload.len() as u8];
        masked.extend_from_slice(&mask);
        for (i, b) in payload.iter().enumerate() {
            masked.push(b ^ mask[i % 4]);
        }
        let mut r = FrameReader::new();
        r.push(&masked);
        match r.next_frame() {
            Some(Frame::Text(s)) => assert_eq!(s, "hello"),
            _ => panic!("expected text frame"),
        }
        assert!(r.next_frame().is_none());
        // The unmasked encoding starts with 0x81.
        assert_eq!(frame[0], 0x81);
    }

    #[test]
    fn round_trip_medium_frame() {
        let text = "x".repeat(200);
        let mask = [0xaa, 0xbb, 0xcc, 0xdd];
        let payload = text.as_bytes();
        let mut bytes = vec![
            0x81,
            0x80 | 126,
            ((payload.len() >> 8) & 0xff) as u8,
            (payload.len() & 0xff) as u8,
        ];
        bytes.extend_from_slice(&mask);
        for (i, b) in payload.iter().enumerate() {
            bytes.push(b ^ mask[i % 4]);
        }
        let mut r = FrameReader::new();
        r.push(&bytes);
        match r.next_frame() {
            Some(Frame::Text(s)) => assert_eq!(s, text),
            _ => panic!(),
        }
    }

    #[test]
    fn ping_decoded() {
        // Empty ping.
        let mut r = FrameReader::new();
        r.push(&[0x89, 0x00]);
        assert!(matches!(r.next_frame(), Some(Frame::Ping(_))));
    }

    #[test]
    fn close_decoded() {
        let mut r = FrameReader::new();
        r.push(&[0x88, 0x80, 0, 0, 0, 0]);
        assert!(matches!(r.next_frame(), Some(Frame::Close)));
    }

    #[test]
    fn b64_basic() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn sha1_known_vector() {
        // SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
        let h = sha1(b"abc");
        let hex: String = h.iter().map(|b| format!("{:02x}", b)).collect();
        assert_eq!(hex, "a9993e364706816aba3e25717850c26c9cd0d89d");
    }
}
