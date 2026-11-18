use super::Format;
use crate::json::Value;
use crate::ws::{Frame, encode_binary_frame, encode_text_frame};
use std::io;
use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};

pub const TEXT_PROTOCOL: &str = "meta-sovereign-sync.lino.v2";
pub const BINARY_PROTOCOL: &str = "meta-sovereign-sync.lino-binary.v2";
pub const JSON_PROTOCOL: &str = "meta-sovereign-sync.v1";
pub const MAX_SYNC_BYTES: usize = 4 * 1024 * 1024;

/// Data and control frames share one writer, so concurrent sends cannot
/// interleave partial socket writes into a corrupt frame.
#[derive(Clone)]
pub(crate) struct SocketWriter(Arc<Mutex<TcpStream>>);
impl SocketWriter {
    pub fn new(stream: TcpStream) -> Self {
        Self(Arc::new(Mutex::new(stream)))
    }
    pub fn write(&self, frame: &[u8]) -> io::Result<()> {
        self.0
            .lock()
            .expect("socket writer poisoned")
            .write_all(frame)
    }
    pub fn peer_addr(&self) -> io::Result<SocketAddr> {
        self.0.lock().expect("socket writer poisoned").peer_addr()
    }
    pub fn shutdown(&self) {
        let _ = self
            .0
            .lock()
            .expect("socket writer poisoned")
            .shutdown(Shutdown::Both);
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct SocketWire {
    pub format: Format,
    pub protocol: &'static str,
}

impl SocketWire {
    pub fn negotiate(offered: Option<&str>, compatibility: bool) -> Option<Self> {
        let offered = offered.unwrap_or("");
        if offered.trim().is_empty() {
            return Some(Self {
                format: if compatibility {
                    Format::Json
                } else {
                    Format::Text
                },
                protocol: "",
            });
        }
        offered.split(',').find_map(|s| {
            let protocol = s.trim();
            let (format, protocol) = match protocol {
                TEXT_PROTOCOL => (Format::Text, TEXT_PROTOCOL),
                BINARY_PROTOCOL => (Format::Binary, BINARY_PROTOCOL),
                JSON_PROTOCOL if compatibility => (Format::Json, JSON_PROTOCOL),
                _ => return None,
            };
            Some(Self { format, protocol })
        })
    }

    pub fn frame(self, value: &Value) -> io::Result<Vec<u8>> {
        if !matches!(value, Value::Object(_)) {
            return Err(invalid("sync message must be an object"));
        }
        // Value/decode depth is bounded independently of the frame size.
        let bytes = self.format.encode(value).map_err(invalid)?;
        if bytes.len() > MAX_SYNC_BYTES {
            return Err(invalid("sync message exceeds 4 MiB"));
        }
        Ok(if self.format == Format::Binary {
            encode_binary_frame(&bytes)
        } else {
            encode_text_frame(std::str::from_utf8(&bytes).map_err(invalid)?)
        })
    }

    pub fn decode(self, frame: Frame) -> io::Result<Value> {
        let bytes = match frame {
            Frame::Text(text) if self.format != Format::Binary => text.into_bytes(),
            Frame::Binary(bytes) if self.format == Format::Binary => bytes,
            _ => return Err(invalid("sync frame does not match negotiated format")),
        };
        if bytes.len() > MAX_SYNC_BYTES {
            return Err(invalid("sync message exceeds 4 MiB"));
        }
        let value = self.format.decode(&bytes).map_err(invalid)?;
        if !matches!(value, Value::Object(_)) {
            return Err(invalid("sync message must be an object"));
        }
        Ok(value)
    }
}

fn invalid(error: impl ToString) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error.to_string())
}
