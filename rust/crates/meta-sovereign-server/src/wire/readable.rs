//! Map the upstream concrete syntax tree to lino-objects-codec's readable
//! object model. Preserve quotes, line boundaries and empty-container types.
use super::{MAX_DEPTH, Result, decode_base64};
use crate::json::Value;
use links_notation::{CstKind, CstNode, ParserConfig, parse_lino_to_cst_with_config};
use std::collections::BTreeMap;

enum Node {
    Atom(String, bool),
    Group {
        rows: Vec<Vec<Node>>,
        multiline: bool,
        object: bool,
    },
}

pub(super) fn decode(text: &str) -> Result<Value> {
    let tree = parse_lino_to_cst_with_config(text, &ParserConfig::new().with_max_depth(MAX_DEPTH))
        .map_err(|e| e.to_string())?;
    let tokens: Vec<_> = tree
        .tokens()
        .into_iter()
        .filter(|t| !matches!(t.kind, CstKind::Whitespace | CstKind::Comment))
        .collect();
    if tokens.len() > 1024 * 1024 {
        return Err("too many wire tokens".into());
    }
    let mut cursor = Cursor { tokens, pos: 0 };
    let rows = cursor.rows(true, 0)?;
    if cursor.pos != cursor.tokens.len() {
        return Err("unexpected closing parenthesis".into());
    }
    if let [row] = rows.as_slice()
        && let [node] = row.as_slice()
    {
        return value(node);
    }
    rows_value(&rows, true, false)
}

struct Cursor<'a> {
    tokens: Vec<&'a CstNode>,
    pos: usize,
}

impl Cursor<'_> {
    fn rows(&mut self, top: bool, depth: usize) -> Result<Vec<Vec<Node>>> {
        if depth > MAX_DEPTH {
            return Err("wire nesting exceeds the decoder limit".into());
        }
        let mut rows = Vec::new();
        let mut row = Vec::new();
        while let Some(token) = self.tokens.get(self.pos) {
            match token.kind {
                CstKind::CloseParen => {
                    if top {
                        return Err("unexpected closing parenthesis".into());
                    }
                    self.pos += 1;
                    if !row.is_empty() {
                        rows.push(row);
                    }
                    return Ok(rows);
                }
                CstKind::Newline => {
                    self.pos += 1;
                    if !row.is_empty() {
                        rows.push(std::mem::take(&mut row));
                    }
                }
                _ => row.push(self.node(depth)?),
            }
        }
        if !top {
            return Err("unterminated wire group".into());
        }
        if !row.is_empty() {
            rows.push(row);
        }
        Ok(rows)
    }

    fn node(&mut self, depth: usize) -> Result<Node> {
        let token = self.tokens[self.pos];
        self.pos += 1;
        match token.kind {
            CstKind::Reference => Ok(Node::Atom(
                token.value.clone().ok_or("missing reference value")?,
                token.quote.is_some(),
            )),
            CstKind::OpenParen => {
                let marker = self
                    .tokens
                    .get(self.pos)
                    .filter(|t| t.kind == CstKind::Reference && t.quote.is_none())
                    .and_then(|t| t.value.as_deref());
                let marked = matches!(marker, Some("o" | "a"))
                    && self
                        .tokens
                        .get(self.pos + 1)
                        .is_some_and(|t| t.kind == CstKind::Colon);
                let object = marked && marker == Some("o");
                if marked {
                    self.pos += 2;
                }
                let multiline = self.tokens[self.pos..]
                    .iter()
                    .take_while(|t| t.kind != CstKind::CloseParen)
                    .any(|t| t.kind == CstKind::Newline);
                Ok(Node::Group {
                    rows: self.rows(false, depth + 1)?,
                    multiline,
                    object,
                })
            }
            _ => Err("unexpected wire token".into()),
        }
    }
}

fn value(node: &Node) -> Result<Value> {
    match node {
        Node::Atom(text, true) => Ok(Value::String(text.clone())),
        Node::Atom(text, false) => Ok(match text.as_str() {
            "null" | "undefined" | "NaN" | "Infinity" | "-Infinity" => Value::Null,
            "true" => Value::Bool(true),
            "false" => Value::Bool(false),
            _ => bare_number(text).unwrap_or_else(|| Value::String(text.clone())),
        }),
        Node::Group {
            rows,
            multiline,
            object,
        } => rows_value(rows, *multiline, *object),
    }
}

fn bare_number(text: &str) -> Option<Value> {
    if !text.bytes().any(|c| c.is_ascii_digit())
        || !text
            .bytes()
            .all(|c| c.is_ascii_digit() || matches!(c, b'+' | b'-' | b'.' | b'e' | b'E'))
    {
        return None;
    }
    let n: f64 = text.parse().ok()?;
    let integer = text
        .trim_start_matches(['+', '-'])
        .bytes()
        .all(|c| c.is_ascii_digit());
    if integer && (!n.is_finite() || n.abs() > 9_007_199_254_740_991.0) {
        return None;
    }
    Some(if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Null
    })
}

fn key(node: &Node) -> Result<String> {
    match node {
        Node::Atom(text, _) => Ok(text.clone()),
        Node::Group {
            rows,
            object: false,
            ..
        } => marked_string(rows)?.ok_or_else(|| "wire object key must be text".into()),
        _ => Err("wire object key must be text".into()),
    }
}

fn rows_value(rows: &[Vec<Node>], multiline: bool, object: bool) -> Result<Value> {
    if object {
        let mut result = BTreeMap::new();
        for node in rows.iter().flatten() {
            let Node::Group {
                rows: pair,
                object: false,
                ..
            } = node
            else {
                return Err("marked object needs pairs".into());
            };
            let [pair] = pair.as_slice() else {
                return Err("marked object needs one-line pairs".into());
            };
            let [k, v] = pair.as_slice() else {
                return Err("marked object needs two-value pairs".into());
            };
            result.insert(key(k)?, value(v)?);
        }
        return Ok(Value::Object(result));
    }
    if rows.is_empty() {
        return Ok(if multiline {
            Value::Object(BTreeMap::new())
        } else {
            Value::Array(Vec::new())
        });
    }
    if let Some(text) = marked_string(rows)? {
        return Ok(Value::String(text));
    }
    if multiline
        && rows
            .iter()
            .all(|row| row.len() == 2 && key(&row[0]).is_ok())
    {
        return rows
            .iter()
            .map(|row| Ok((key(&row[0])?, value(&row[1])?)))
            .collect::<Result<BTreeMap<_, _>>>()
            .map(Value::Object);
    }
    rows.iter()
        .flatten()
        .map(value)
        .collect::<Result<Vec<_>>>()
        .map(Value::Array)
}

fn marked_string(rows: &[Vec<Node>]) -> Result<Option<String>> {
    let [row] = rows else {
        return Ok(None);
    };
    let [Node::Atom(marker, false), Node::Atom(payload, true)] = row.as_slice() else {
        return Ok(None);
    };
    match marker.as_str() {
        "base64" => Ok(Some(decode_base64(payload))),
        "escaped" => {
            let mut bytes = Vec::with_capacity(payload.len());
            let mut chars = payload.bytes();
            while let Some(c) = chars.next() {
                if c == b'%' {
                    let a = chars.next().and_then(hex).ok_or("invalid percent escape")?;
                    let b = chars.next().and_then(hex).ok_or("invalid percent escape")?;
                    bytes.push(a * 16 + b);
                } else {
                    bytes.push(c);
                }
            }
            String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| "invalid UTF-8 escaped value".into())
        }
        _ => Ok(None),
    }
}

fn hex(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

pub(super) fn encode(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(value) => value.to_string(),
        Value::Number(n) => {
            if !n.is_finite() {
                "null".into()
            } else if n.fract() == 0.0 && n.abs() > 9_007_199_254_740_991.0 {
                format!("{n:e}")
            } else {
                n.to_string()
            }
        }
        Value::String(text) => quote(text),
        Value::Array(values) => format!(
            "({}{})",
            if values.as_slice() == [Value::Null] {
                "a: "
            } else {
                ""
            },
            values.iter().map(encode).collect::<Vec<_>>().join(" ")
        ),
        Value::Object(values) => format!(
            "(o:{})",
            values
                .iter()
                .map(|(key, v)| format!(" ({} {})", quote(key), encode(v)))
                .collect::<String>()
        ),
    }
}

fn quote(text: &str) -> String {
    if text.chars().any(|c| c.is_control()) {
        let mut escaped = String::new();
        for c in text.chars() {
            if c.is_control() || c == '%' {
                use std::fmt::Write;
                for byte in c.to_string().as_bytes() {
                    let _ = write!(escaped, "%{byte:02X}");
                }
            } else {
                escaped.push(c);
            }
        }
        return format!("(escaped {})", quote(&escaped));
    }
    if !text.contains('"') {
        return format!("\"{text}\"");
    }
    let max_run = text.split(|c| c != '"').map(str::len).max().unwrap_or(0);
    let delimiters = "\"".repeat((max_run + 1).max(3));
    format!("{delimiters}{text}{delimiters}")
}
