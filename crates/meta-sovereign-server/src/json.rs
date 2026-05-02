//! Minimal JSON encoder/decoder.
//!
//! The JS server only ever ships objects with string keys and string /
//! number / boolean / null / array / nested-object values, so we only
//! implement the subset the SPA actually consumes. This avoids pulling
//! in `serde_json` and keeps the crate `std`-only.

use std::collections::BTreeMap;
use std::fmt::Write as _;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Value>),
    Object(BTreeMap<String, Value>),
}

impl Value {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }
    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Array(a) => Some(a),
            _ => None,
        }
    }
    pub fn as_object(&self) -> Option<&BTreeMap<String, Value>> {
        match self {
            Value::Object(o) => Some(o),
            _ => None,
        }
    }
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.as_object().and_then(|o| o.get(key))
    }
}

pub fn obj() -> BTreeMap<String, Value> {
    BTreeMap::new()
}

pub fn encode(v: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, v);
    out
}

fn write_value(out: &mut String, v: &Value) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(true) => out.push_str("true"),
        Value::Bool(false) => out.push_str("false"),
        Value::Number(n) => {
            if n.fract() == 0.0 && n.is_finite() && n.abs() < 1e16 {
                let _ = write!(out, "{}", *n as i64);
            } else {
                let _ = write!(out, "{n}");
            }
        }
        Value::String(s) => write_string(out, s),
        Value::Array(arr) => {
            out.push('[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(out, item);
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            for (i, (k, val)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write_value(out, val);
            }
            out.push('}');
        }
    }
}

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

#[derive(Debug)]
pub struct ParseError(pub String);

pub fn parse(text: &str) -> Result<Value, ParseError> {
    let bytes: Vec<char> = text.chars().collect();
    let mut p = Parser { bytes, pos: 0 };
    p.skip_ws();
    let v = p.parse_value()?;
    p.skip_ws();
    if p.pos != p.bytes.len() {
        return Err(ParseError("trailing content".into()));
    }
    Ok(v)
}

struct Parser {
    bytes: Vec<char>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<char> {
        self.bytes.get(self.pos).copied()
    }
    fn bump(&mut self) -> Option<char> {
        let c = self.peek()?;
        self.pos += 1;
        Some(c)
    }
    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(c) if c.is_whitespace()) {
            self.pos += 1;
        }
    }
    fn expect(&mut self, c: char) -> Result<(), ParseError> {
        if self.peek() == Some(c) {
            self.pos += 1;
            Ok(())
        } else {
            Err(ParseError(format!("expected '{c}'")))
        }
    }
    fn parse_value(&mut self) -> Result<Value, ParseError> {
        self.skip_ws();
        match self.peek() {
            Some('{') => self.parse_object(),
            Some('[') => self.parse_array(),
            Some('"') => self.parse_string().map(Value::String),
            Some('t') | Some('f') => self.parse_bool(),
            Some('n') => self.parse_null(),
            Some(c) if c == '-' || c.is_ascii_digit() => self.parse_number(),
            Some(c) => Err(ParseError(format!("unexpected '{c}'"))),
            None => Err(ParseError("unexpected end".into())),
        }
    }
    fn parse_object(&mut self) -> Result<Value, ParseError> {
        self.expect('{')?;
        let mut map = BTreeMap::new();
        self.skip_ws();
        if self.peek() == Some('}') {
            self.pos += 1;
            return Ok(Value::Object(map));
        }
        loop {
            self.skip_ws();
            let key = self.parse_string()?;
            self.skip_ws();
            self.expect(':')?;
            let v = self.parse_value()?;
            map.insert(key, v);
            self.skip_ws();
            match self.peek() {
                Some(',') => {
                    self.pos += 1;
                    continue;
                }
                Some('}') => {
                    self.pos += 1;
                    return Ok(Value::Object(map));
                }
                _ => return Err(ParseError("expected ',' or '}'".into())),
            }
        }
    }
    fn parse_array(&mut self) -> Result<Value, ParseError> {
        self.expect('[')?;
        let mut arr = Vec::new();
        self.skip_ws();
        if self.peek() == Some(']') {
            self.pos += 1;
            return Ok(Value::Array(arr));
        }
        loop {
            arr.push(self.parse_value()?);
            self.skip_ws();
            match self.peek() {
                Some(',') => {
                    self.pos += 1;
                    continue;
                }
                Some(']') => {
                    self.pos += 1;
                    return Ok(Value::Array(arr));
                }
                _ => return Err(ParseError("expected ',' or ']'".into())),
            }
        }
    }
    fn parse_string(&mut self) -> Result<String, ParseError> {
        self.expect('"')?;
        let mut out = String::new();
        loop {
            let c = self
                .bump()
                .ok_or_else(|| ParseError("unterminated string".into()))?;
            if c == '"' {
                return Ok(out);
            }
            if c == '\\' {
                let esc = self.bump().ok_or_else(|| ParseError("bad escape".into()))?;
                match esc {
                    '"' | '\\' | '/' => out.push(esc),
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    'b' => out.push('\u{08}'),
                    'f' => out.push('\u{0c}'),
                    'u' => {
                        let mut code = 0u32;
                        for _ in 0..4 {
                            let h = self.bump().ok_or_else(|| ParseError("bad \\u".into()))?;
                            code = code * 16
                                + h.to_digit(16).ok_or_else(|| ParseError("bad hex".into()))?;
                        }
                        if let Some(ch) = char::from_u32(code) {
                            out.push(ch);
                        }
                    }
                    _ => return Err(ParseError(format!("bad escape \\{esc}"))),
                }
            } else {
                out.push(c);
            }
        }
    }
    fn parse_bool(&mut self) -> Result<Value, ParseError> {
        if self.starts_with("true") {
            self.pos += 4;
            Ok(Value::Bool(true))
        } else if self.starts_with("false") {
            self.pos += 5;
            Ok(Value::Bool(false))
        } else {
            Err(ParseError("expected bool".into()))
        }
    }
    fn parse_null(&mut self) -> Result<Value, ParseError> {
        if self.starts_with("null") {
            self.pos += 4;
            Ok(Value::Null)
        } else {
            Err(ParseError("expected null".into()))
        }
    }
    fn starts_with(&self, s: &str) -> bool {
        let chars: Vec<char> = s.chars().collect();
        if self.pos + chars.len() > self.bytes.len() {
            return false;
        }
        for (i, c) in chars.iter().enumerate() {
            if self.bytes[self.pos + i] != *c {
                return false;
            }
        }
        true
    }
    fn parse_number(&mut self) -> Result<Value, ParseError> {
        let start = self.pos;
        if self.peek() == Some('-') {
            self.pos += 1;
        }
        while matches!(self.peek(), Some(c) if c.is_ascii_digit() || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-')
        {
            self.pos += 1;
        }
        let s: String = self.bytes[start..self.pos].iter().collect();
        s.parse::<f64>()
            .map(Value::Number)
            .map_err(|_| ParseError(format!("bad number: {s}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_object() {
        let mut o = obj();
        o.insert("k".into(), Value::String("v".into()));
        o.insert("n".into(), Value::Number(42.0));
        o.insert("b".into(), Value::Bool(true));
        o.insert(
            "a".into(),
            Value::Array(vec![Value::Number(1.0), Value::Number(2.0)]),
        );
        let s = encode(&Value::Object(o.clone()));
        let parsed = parse(&s).unwrap();
        assert_eq!(parsed, Value::Object(o));
    }

    #[test]
    fn parse_nested() {
        let s = r#"{"a":{"b":[1,2,{"c":"d"}]}}"#;
        let v = parse(s).unwrap();
        assert_eq!(
            v.get("a")
                .and_then(|x| x.get("b"))
                .and_then(|x| x.as_array())
                .map(|a| a.len()),
            Some(3)
        );
    }

    #[test]
    fn escape_strings() {
        let s = encode(&Value::String("a\"b\nc".into()));
        assert_eq!(s, r#""a\"b\nc""#);
        let v = parse(r#""a\"b\nc""#).unwrap();
        assert_eq!(v.as_str(), Some("a\"b\nc"));
    }
}
