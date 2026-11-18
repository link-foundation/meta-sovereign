//! The typed object wire model shared with `js/src/transport/lino.js`.
//! The upstream library owns LiNo syntax and binary packets. This module maps
//! the application's finite, acyclic JSON-shaped values onto that model.

mod compact;
pub(crate) mod http;
mod readable;
pub mod socket;

use crate::json::{self, Value};
use links_notation::binary::{BinaryLinoCodec, DecodeLimits};
use links_notation::{ParserConfig, parse_lino_to_links_with_config};

pub const TEXT: &str = "text/lino";
pub const BINARY: &str = "application/lino-binary";
pub const LINE: &str = "text/lino-line";
pub const COMPACT: &str = "text/lino-compact";
pub const JSON: &str = "application/json";
pub const MAX_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_DEPTH: usize = 64;

pub type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Text,
    Binary,
    Line,
    Compact,
    Json,
}

impl Format {
    pub fn from_media(media: &str, json_compatibility: bool) -> Result<Self> {
        match media
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            TEXT | "application/problem+lino" => Ok(Self::Text),
            BINARY => Ok(Self::Binary),
            LINE => Ok(Self::Line),
            COMPACT => Ok(Self::Compact),
            JSON | "application/problem+json" if json_compatibility => Ok(Self::Json),
            _ => Err("unsupported wire media type".into()),
        }
    }

    pub fn media(self) -> &'static str {
        match self {
            Self::Text => TEXT,
            Self::Binary => BINARY,
            Self::Line => LINE,
            Self::Compact => COMPACT,
            Self::Json => JSON,
        }
    }

    pub fn encode(self, value: &Value) -> Result<Vec<u8>> {
        check_value(value, 0)?;
        let encoded = match self {
            Self::Json => json::encode(value).into_bytes(),
            Self::Text | Self::Line => readable::encode(value).into_bytes(),
            Self::Compact => compact::encode(value).to_string().into_bytes(),
            Self::Binary => codec()
                .encode(&[compact::encode(value)])
                .map_err(|e| e.to_string())?,
        };
        check_size(encoded.len())?;
        Ok(encoded)
    }

    pub fn decode(self, bytes: &[u8]) -> Result<Value> {
        check_size(bytes.len())?;
        if self == Self::Binary {
            let document = codec().decode(bytes).map_err(|e| e.to_string())?;
            return compact::decode_document(&document);
        }
        let text = std::str::from_utf8(bytes).map_err(|_| "invalid UTF-8 wire value")?;
        if self == Self::Json {
            // Check the value's depth before the existing recursive JSON reader.
            check_json_depth(text)?;
            let value = json::parse(text).map_err(|e| e.0)?;
            check_value(&value, 0)?;
            return Ok(value);
        }
        let config = ParserConfig::new().with_max_depth(MAX_DEPTH);
        if self == Self::Compact {
            let document =
                parse_lino_to_links_with_config(text, &config).map_err(|e| e.to_string())?;
            return compact::decode_document(&document);
        }
        if self == Self::Line && text.trim_matches(['\r', '\n']).contains(['\r', '\n']) {
            return Err("a single-line document cannot contain a line break".into());
        }
        // The JS default reader also accepts the explicit typed compact form.
        // Identify a known marker using the parsed model, never payload sniffing
        // between JSON, binary and text representations.
        let document = parse_lino_to_links_with_config(text, &config).map_err(|e| e.to_string())?;
        if self == Self::Text && compact::is_typed_document(text, &document) {
            compact::decode_document(&document)
        } else {
            readable::decode(text)
        }
    }
}

fn codec() -> BinaryLinoCodec {
    BinaryLinoCodec {
        limits: DecodeLimits {
            max_links: 1024 * 1024,
            max_references: 4 * 1024 * 1024,
            max_nodes: 256 * 1024,
            max_string_bytes: MAX_BYTES,
            max_depth: MAX_DEPTH,
        },
        ..BinaryLinoCodec::default()
    }
}

fn check_size(size: usize) -> Result<()> {
    if size > MAX_BYTES {
        Err("wire body exceeds the decoder limit".into())
    } else {
        Ok(())
    }
}

fn check_value(value: &Value, depth: usize) -> Result<()> {
    if depth > MAX_DEPTH {
        return Err("wire nesting exceeds the decoder limit".into());
    }
    match value {
        Value::Array(values) => values.iter().try_for_each(|v| check_value(v, depth + 1)),
        Value::Object(values) => values.values().try_for_each(|v| check_value(v, depth + 1)),
        _ => Ok(()),
    }
}

fn check_json_depth(text: &str) -> Result<()> {
    let mut depth = 0usize;
    let mut quoted = false;
    let mut escaped = false;
    for c in text.chars() {
        if quoted {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                quoted = false;
            }
        } else if c == '"' {
            quoted = true;
        } else if matches!(c, '[' | '{') {
            depth += 1;
            if depth > MAX_DEPTH {
                return Err("wire nesting exceeds the decoder limit".into());
            }
        } else if matches!(c, ']' | '}') {
            depth = depth.saturating_sub(1);
        }
    }
    Ok(())
}

/// Match the existing JS object's base64 string semantics, including URL-safe
/// input, ignored non-alphabet characters and lossy UTF-8 on compact strings.
fn decode_base64(text: &str) -> String {
    let mut bytes = Vec::with_capacity(text.len() / 4 * 3);
    let mut bits = 0u32;
    let mut count = 0;
    for c in text.bytes() {
        let value = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            _ => continue,
        };
        bits = ((bits << 6) | u32::from(value)) & 0xffffff;
        count += 6;
        if count >= 8 {
            count -= 8;
            bytes.push((bits >> count) as u8);
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}
