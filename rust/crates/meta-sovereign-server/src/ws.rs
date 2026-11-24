//! Bounded RFC 6455 framing for native text/binary sync and signaling.
//! Handshake SHA-1 is required by RFC 6455 and is not used for authentication.
use crate::wire::socket::MAX_SYNC_BYTES;

const GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

pub fn accept_key(client_key: &str) -> String {
    let mut input = String::with_capacity(client_key.len() + GUID.len());
    input.push_str(client_key);
    input.push_str(GUID);
    base64_encode(&sha1(input.as_bytes()))
}

fn encode_frame(opcode: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len();
    let mut out = Vec::with_capacity(10 + len);
    out.push(0x80 | opcode);
    if len < 126 {
        out.push(len as u8);
    } else if len <= u16::MAX as usize {
        out.push(126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(payload);
    out
}

pub fn encode_text_frame(text: &str) -> Vec<u8> {
    encode_frame(1, text.as_bytes())
}
pub fn encode_binary_frame(bytes: &[u8]) -> Vec<u8> {
    encode_frame(2, bytes)
}
pub fn encode_pong_frame() -> [u8; 2] {
    [0x8a, 0]
}
pub fn encode_pong_payload(bytes: &[u8]) -> Vec<u8> {
    encode_frame(10, bytes)
}
pub fn encode_close_frame(code: u16) -> Vec<u8> {
    encode_frame(8, &code.to_be_bytes())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Frame {
    Text(String),
    Binary(Vec<u8>),
    Ping(Vec<u8>),
    Pong(Vec<u8>),
    Close,
    Invalid(u16),
}

/// A streaming message reader with bounded fragments and fatal protocol errors.
#[derive(Default)]
pub struct FrameReader {
    buf: Vec<u8>,
    fragment: Option<(u8, Vec<u8>)>,
    require_mask: bool,
    failed: bool,
    error: Option<u16>,
}

impl FrameReader {
    pub fn new() -> Self {
        Self::default()
    }
    /// A server must require masks on every client frame.
    pub fn client() -> Self {
        Self {
            require_mask: true,
            ..Self::default()
        }
    }
    fn fail(&mut self, code: u16) {
        self.failed = true;
        self.error = Some(code);
        self.buf.clear();
        self.fragment = None;
    }
    pub fn push(&mut self, chunk: &[u8]) {
        if self.failed {
            return;
        }
        // The connection reads 4 KiB chunks; allow a completed maximum-sized
        // frame and the start of its successor without an unbounded buffer.
        if self.buf.len().saturating_add(chunk.len()) > MAX_SYNC_BYTES + 8192 + 14 {
            self.fail(1009);
        } else {
            self.buf.extend_from_slice(chunk);
        }
    }
    pub fn next_frame(&mut self) -> Option<Frame> {
        if let Some(code) = self.error.take() {
            return Some(Frame::Invalid(code));
        }
        if self.failed {
            return None;
        }
        loop {
            if self.buf.len() < 2 {
                return None;
            }
            let fin = self.buf[0] & 0x80 != 0;
            let opcode = self.buf[0] & 15;
            let masked = self.buf[1] & 0x80 != 0;
            if self.buf[0] & 0x70 != 0
                || (self.require_mask && !masked)
                || !matches!(opcode, 0 | 1 | 2 | 8 | 9 | 10)
                || (opcode >= 8 && !fin)
                || (opcode == 0 && self.fragment.is_none())
                || (matches!(opcode, 1 | 2) && self.fragment.is_some())
            {
                self.fail(1002);
                return self.next_frame();
            }
            let short = self.buf[1] & 127;
            let (length, header) = match short {
                126 => {
                    if self.buf.len() < 4 {
                        return None;
                    }
                    (u16::from_be_bytes([self.buf[2], self.buf[3]]) as u64, 4)
                }
                127 => {
                    if self.buf.len() < 10 {
                        return None;
                    }
                    (u64::from_be_bytes(self.buf[2..10].try_into().unwrap()), 10)
                }
                n => (u64::from(n), 2),
            };
            if length > MAX_SYNC_BYTES as u64
                || self.fragment.as_ref().is_some_and(|(_, bytes)| {
                    opcode == 0 && bytes.len() as u64 + length > MAX_SYNC_BYTES as u64
                })
            {
                self.fail(1009);
                return self.next_frame();
            }
            if (opcode >= 8 && length > 125)
                || (short == 126 && length < 126)
                || (short == 127 && length <= u16::MAX as u64)
            {
                self.fail(1002);
                return self.next_frame();
            }
            let length = length as usize;
            let start = header + if masked { 4 } else { 0 };
            let total = start + length;
            if self.buf.len() < total {
                return None;
            }
            let mut payload = self.buf[start..total].to_vec();
            if masked {
                let mask = &self.buf[header..header + 4];
                for (i, byte) in payload.iter_mut().enumerate() {
                    *byte ^= mask[i % 4];
                }
            }
            self.buf.drain(..total);
            match opcode {
                8 => {
                    if payload.len() == 1 {
                        self.fail(1002);
                        return self.next_frame();
                    }
                    if payload.len() >= 2 {
                        let code = u16::from_be_bytes([payload[0], payload[1]]);
                        if !(1000..=4999).contains(&code)
                            || matches!(code, 1004 | 1005 | 1006 | 1015)
                            || (1016..=2999).contains(&code)
                        {
                            self.fail(1002);
                            return self.next_frame();
                        }
                    }
                    if payload.len() > 2 && std::str::from_utf8(&payload[2..]).is_err() {
                        self.fail(1007);
                        return self.next_frame();
                    }
                    return Some(Frame::Close);
                }
                9 => return Some(Frame::Ping(payload)),
                10 => return Some(Frame::Pong(payload)),
                _ => {}
            }
            let (kind, bytes) = if opcode == 0 {
                let (kind, mut bytes) = self.fragment.take().unwrap();
                bytes.extend_from_slice(&payload);
                (kind, bytes)
            } else {
                (opcode, payload)
            };
            if !fin {
                self.fragment = Some((kind, bytes));
                continue;
            }
            if kind == 2 {
                return Some(Frame::Binary(bytes));
            }
            match String::from_utf8(bytes) {
                Ok(text) => return Some(Frame::Text(text)),
                Err(_) => {
                    self.fail(1007);
                    return self.next_frame();
                }
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

pub(crate) fn base64_encode(data: &[u8]) -> String {
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
    fn malformed_headers_fail_before_any_payload_allocation() {
        for bytes in [
            vec![0x82, 127, 0, 0, 0, 1, 0, 0, 0, 0],
            vec![0x82, 127, 0, 0, 0, 0, 0, 64, 0, 1],
            vec![0xc1, 0],
            vec![0x80, 0],
            vec![0x09, 0],
            vec![0x81, 1, 0xff],
            vec![0x88, 1, 0],
            vec![0x88, 2, 0x03, 0xed],
        ] {
            let mut reader = FrameReader::new();
            reader.push(&bytes);
            assert!(
                matches!(reader.next_frame(), Some(Frame::Invalid(_))),
                "{bytes:?}"
            );
            reader.push(&encode_text_frame("ignored"));
            assert!(reader.next_frame().is_none());
            assert!(reader.buf.is_empty());
        }
        let mut server = FrameReader::client();
        server.push(&encode_text_frame("unmasked client"));
        assert_eq!(server.next_frame(), Some(Frame::Invalid(1002)));
    }

    #[test]
    fn fragmented_unicode_binary_and_interleaved_ping_preserve_bytes() {
        let mut reader = FrameReader::new();
        reader.push(&[0x01, 2, 0xf0, 0x9f, 0x89, 1, 42, 0x80, 2, 0x9a, 0x80]);
        assert_eq!(reader.next_frame(), Some(Frame::Ping(vec![42])));
        assert_eq!(reader.next_frame(), Some(Frame::Text("🚀".into())));
        reader.push(&encode_binary_frame(&[0, 255, 128]));
        assert_eq!(reader.next_frame(), Some(Frame::Binary(vec![0, 255, 128])));
        assert!(reader.next_frame().is_none());
    }

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
