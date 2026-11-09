use super::{MAX_DEPTH, Result, decode_base64};
use crate::json::Value;
use crate::ws::base64_encode;
use links_notation::LiNo;
use std::collections::BTreeMap;

type Node = LiNo<String>;

fn atom(text: impl Into<String>) -> Node {
    Node::reference(text.into())
}

pub(super) fn encode(value: &Value) -> Node {
    let parts = match value {
        Value::Null => vec![atom("null")],
        Value::Bool(value) => vec![atom("bool"), atom(value.to_string())],
        Value::Number(value) if value.is_finite() => vec![
            atom(if value.fract() == 0.0 { "int" } else { "float" }),
            atom(value.to_string()),
        ],
        Value::Number(_) => vec![atom("null")],
        Value::String(value) => vec![atom("str"), atom(base64_encode(value.as_bytes()))],
        Value::Array(values) => std::iter::once(atom("array"))
            .chain(values.iter().map(encode))
            .collect(),
        Value::Object(values) => std::iter::once(atom("object"))
            .chain(values.iter().map(|(key, value)| {
                Node::anonymous(vec![encode(&Value::String(key.clone())), encode(value)])
            }))
            .collect(),
    };
    Node::anonymous(parts)
}

fn reference(node: &Node) -> Option<&str> {
    match node {
        Node::Ref(text) => Some(text),
        _ => None,
    }
}

pub(super) fn is_typed_document(text: &str, document: &[Node]) -> bool {
    // The semantic AST loses quotes and line boundaries. A readable `[null]`
    // spans several lines, while compact null is `(null)` on its first line.
    // Inspect the original first line exactly as the JS codec does; quoted
    // marker strings and explicit readable a:/o: groups are not compact.
    let Some(line) = text.lines().map(str::trim).find(|line| !line.is_empty()) else {
        return false;
    };
    let Some(body) = line.strip_prefix('(') else {
        return false;
    };
    let body = body.trim_start();
    let end = body
        .find(|c: char| c.is_whitespace() || matches!(c, '(' | ')'))
        .unwrap_or(body.len());
    let marker = &body[..end];
    if !matches!(
        marker,
        "null" | "undefined" | "bool" | "int" | "float" | "str" | "array" | "object"
    ) {
        return false;
    }
    if matches!(marker, "null" | "undefined") && !body[end..].trim_start().starts_with(')') {
        return false;
    }
    matches!(document, [Node::Link { id: None, values }] if values.first().and_then(reference) == Some(marker))
}

pub(super) fn decode_document(document: &[Node]) -> Result<Value> {
    match document {
        [node] => decode(node, 0),
        _ => Err("expected one typed wire value".into()),
    }
}

fn decode(node: &Node, depth: usize) -> Result<Value> {
    if depth > MAX_DEPTH {
        return Err("wire nesting exceeds the decoder limit".into());
    }
    let Node::Link { id: None, values } = node else {
        return Err("expected an acyclic typed wire value".into());
    };
    let marker = values
        .first()
        .and_then(reference)
        .ok_or("missing wire type")?;
    let payload = || {
        values
            .get(1)
            .and_then(reference)
            .ok_or_else(|| "missing scalar payload".to_string())
    };
    match marker {
        "null" | "undefined" if values.len() == 1 => Ok(Value::Null),
        "bool" if values.len() == 2 => match payload()? {
            "true" => Ok(Value::Bool(true)),
            "false" => Ok(Value::Bool(false)),
            _ => Err("invalid boolean".into()),
        },
        "int" | "float" if values.len() == 2 => {
            let n: f64 = payload()?.parse().map_err(|_| "invalid number")?;
            Ok(if n.is_finite() {
                Value::Number(n)
            } else {
                Value::Null
            })
        }
        "str" if values.len() == 2 => Ok(Value::String(decode_base64(payload()?))),
        "array" => values[1..]
            .iter()
            .map(|v| decode(v, depth + 1))
            .collect::<Result<Vec<_>>>()
            .map(Value::Array),
        "object" => {
            let mut object = BTreeMap::new();
            for pair in &values[1..] {
                let Node::Link {
                    id: None,
                    values: pair,
                } = pair
                else {
                    return Err("invalid typed object pair".into());
                };
                if pair.len() != 2 {
                    return Err("invalid typed object pair".into());
                }
                let Value::String(key) = decode(&pair[0], depth + 1)? else {
                    return Err("wire object key must be text".into());
                };
                object.insert(key, decode(&pair[1], depth + 1)?);
            }
            Ok(Value::Object(object))
        }
        _ => Err("invalid typed wire value".into()),
    }
}
