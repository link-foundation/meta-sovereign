//! Checked register for the native server's finite structured record model.
//! Preserve the production JavaScript rank; wire syntax remains in `wire`.

use std::cmp::Ordering;
use std::collections::BTreeMap;

use meta_sovereign_core::{
    AssignmentStamp, Link, SyncError, VectorClock, try_compare_assignments, try_vc_compare,
    try_vc_merge,
};

use crate::json::{self, Value};

const STAMP: &str = "__msSyncStamp";
const DELETED: &str = "__msSyncDeleted";
const MAX_COUNTER: f64 = 9_007_199_254_740_991.0;

fn text(s: impl Into<String>) -> Value {
    Value::String(s.into())
}
fn list(values: impl IntoIterator<Item = Value>) -> Value {
    Value::Array(values.into_iter().collect())
}
fn cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

// Rust supplies the shortest round-trip digits. Apply JavaScript's decimal
// window and exponent spelling to those digits before building the type key.
fn number_string(n: f64) -> String {
    if n == 0.0 {
        return "0".into();
    }
    let raw = n.abs().to_string();
    let (mantissa, exponent) = raw.split_once('e').unwrap_or((&raw, "0"));
    let before = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let leading = digits.bytes().take_while(|c| *c == b'0').count();
    let significant = digits[leading..].trim_end_matches('0');
    let power = before - leading as i32 - 1 + exponent.parse::<i32>().unwrap_or(0);
    let sign = if n.is_sign_negative() { "-" } else { "" };
    if !(-6..21).contains(&power) {
        let tail = if significant.len() > 1 {
            format!(".{}", &significant[1..])
        } else {
            String::new()
        };
        format!(
            "{sign}{}{tail}e{}{power}",
            &significant[..1],
            if power >= 0 { "+" } else { "" }
        )
    } else if power < 0 {
        format!("{sign}0.{}{significant}", "0".repeat((-power - 1) as usize))
    } else {
        let point = (power + 1) as usize;
        if point >= significant.len() {
            format!(
                "{sign}{significant}{}",
                "0".repeat(point - significant.len())
            )
        } else {
            format!("{sign}{}.{}", &significant[..point], &significant[point..])
        }
    }
}

fn key_value(value: &Value, depth: usize) -> Result<Value, SyncError> {
    if depth > 64 {
        return Err(SyncError::InvalidValue);
    }
    Ok(match value {
        Value::Null => list([text("null")]),
        Value::Bool(v) => list([text("boolean"), text(v.to_string())]),
        Value::Number(v) if v.is_finite() => list([
            text("number"),
            text(if *v == 0.0 && v.is_sign_negative() {
                "-0".into()
            } else {
                number_string(*v)
            }),
        ]),
        Value::Number(_) => return Err(SyncError::InvalidValue),
        Value::String(v) => list([text("string"), text(v)]),
        Value::Array(values) => list([
            text("array"),
            list(
                values
                    .iter()
                    .map(|v| key_value(v, depth + 1))
                    .collect::<Result<Vec<_>, _>>()?,
            ),
        ]),
        Value::Object(values) => {
            let mut pairs: Vec<_> = values.iter().collect();
            pairs.sort_by(|(a, _), (b, _)| cmp(a, b));
            list([
                text("object"),
                list(
                    pairs
                        .into_iter()
                        .map(|(k, v)| Ok(list([text(k), key_value(v, depth + 1)?])))
                        .collect::<Result<Vec<_>, SyncError>>()?,
                ),
            ])
        }
    })
}

// Match String(value ?? '') for arbitrary versions in the shared JSON shape.
// Payload validation bounds nesting before this conversion.
fn version_string(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(v)) => v.clone(),
        Some(Value::Bool(v)) => v.to_string(),
        Some(Value::Number(v)) => number_string(*v),
        Some(Value::Object(_)) => "[object Object]".into(),
        Some(Value::Array(values)) => values
            .iter()
            .map(|v| version_string(Some(v)))
            .collect::<Vec<_>>()
            .join(","),
    }
}

fn clock(value: &Value) -> Result<VectorClock, SyncError> {
    let Value::Object(values) = value else {
        return Err(SyncError::InvalidClock);
    };
    values
        .iter()
        .try_fold(VectorClock::new(), |mut out, (actor, value)| {
            let Value::Number(n) = value else {
                return Err(SyncError::InvalidClock);
            };
            if !n.is_finite() || !(0.0..=MAX_COUNTER).contains(n) || n.fract() != 0.0 {
                return Err(SyncError::InvalidClock);
            }
            if *n > 0.0 {
                out.insert(actor.clone(), *n as u64);
            }
            Ok(out)
        })
}

fn encoded_clock(clock: &VectorClock) -> Value {
    Value::Object(
        clock
            .iter()
            .map(|(k, n)| (k.clone(), Value::Number(*n as f64)))
            .collect(),
    )
}

pub fn is_deleted(value: &Value) -> bool {
    value.get(DELETED) == Some(&Value::Number(1.0))
}

struct Assignment {
    payload: BTreeMap<String, Value>,
    context: Option<VectorClock>,
    clock: Option<VectorClock>,
    children: Option<Vec<String>>,
    key: String,
    version: String,
}

fn read(value: &Value) -> Result<Assignment, SyncError> {
    let Value::Object(values) = value else {
        return Err(SyncError::InvalidValue);
    };
    if value.get("id").and_then(Value::as_str).is_none() {
        return Err(SyncError::InvalidValue);
    }
    let children = match values.get("children") {
        None => None,
        Some(Value::Null) => Some(Vec::new()),
        Some(Value::Array(items)) => Some(
            items
                .iter()
                .map(|v| v.as_str().map(String::from).ok_or(SyncError::InvalidValue))
                .collect::<Result<Vec<_>, _>>()?,
        ),
        _ => return Err(SyncError::InvalidValue),
    };
    let context = match values.get("vc") {
        None | Some(Value::Null) => None,
        Some(v) => Some(clock(v)?),
    };
    if values.contains_key(DELETED)
        && (!is_deleted(value)
            || context.as_ref().is_none_or(BTreeMap::is_empty)
            || values
                .keys()
                .any(|k| !["id", "vc", "children", STAMP, DELETED].contains(&k.as_str())))
    {
        return Err(SyncError::InvalidValue);
    }
    let origin = if let Some(stamp) = values.get(STAMP) {
        let current = context.as_ref().ok_or(SyncError::InvalidValue)?;
        if stamp.get("version") != Some(&Value::Number(1.0)) {
            return Err(SyncError::InvalidValue);
        }
        let before = clock(stamp.get("context").ok_or(SyncError::InvalidValue)?)?;
        let origin = clock(stamp.get("clock").ok_or(SyncError::InvalidValue)?)?;
        match (
            try_vc_compare(current, &before)?,
            try_vc_compare(&before, &origin)?,
        ) {
            (Some(Ordering::Equal), Some(Ordering::Equal | Ordering::Greater)) => Some(origin),
            (Some(Ordering::Greater), Some(Ordering::Equal | Ordering::Greater)) => {
                Some(current.clone())
            }
            _ => return Err(SyncError::InvalidValue),
        }
    } else {
        context.clone()
    };
    let mut payload = values.clone();
    for key in ["vc", "children", STAMP] {
        payload.remove(key);
    }
    let key = json::encode(&key_value(&Value::Object(payload.clone()), 0)?);
    let version = version_string(payload.get("version"));
    Ok(Assignment {
        payload,
        context,
        clock: origin,
        children,
        key,
        version,
    })
}

/// Merge finite rich records without changing either input. Validation runs on
/// both records, including the loser; retained deletion records contain no body.
pub fn merge(a: &Value, b: &Value) -> Result<Value, SyncError> {
    let a = read(a)?;
    let b = read(b)?;
    if a.payload.get("id") != b.payload.get("id") {
        return Err(SyncError::InvalidValue);
    }
    let winner = if try_compare_assignments(
        a.clock.as_ref(),
        Some(&a.version),
        &a.key,
        b.clock.as_ref(),
        Some(&b.version),
        &b.key,
    )?
    .is_lt()
    {
        &b
    } else {
        &a
    };
    let context = match (&a.context, &b.context) {
        (Some(a), Some(b)) => Some(try_vc_merge(a, b)?),
        (a, b) => a.as_ref().or(b.as_ref()).cloned(),
    };
    let mut next = winner.payload.clone();
    if let Some(context) = context {
        next.insert("vc".into(), encoded_clock(&context));
        if let Some(origin) = &winner.clock
            && try_vc_compare(&context, origin)? != Some(Ordering::Equal)
        {
            next.insert(
                STAMP.into(),
                Value::Object(BTreeMap::from([
                    ("version".into(), Value::Number(1.0)),
                    ("clock".into(), encoded_clock(origin)),
                    ("context".into(), encoded_clock(&context)),
                ])),
            );
        }
    }
    if a.children.is_some() || b.children.is_some() {
        let mut children: Vec<_> = a
            .children
            .into_iter()
            .flatten()
            .chain(b.children.into_iter().flatten())
            .collect();
        children.sort_by(|a, b| cmp(a, b));
        children.dedup();
        next.insert("children".into(), list(children.into_iter().map(text)));
    }
    Ok(Value::Object(next))
}

/// Retain synchronization metadata in the core mirror of a validated record.
pub(crate) fn core_link(value: &Value) -> Result<Link, SyncError> {
    let assignment = read(value)?;
    let mut core = Link::new(
        value.get("id").and_then(Value::as_str).unwrap(),
        value
            .get("tokens")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str),
    );
    core.children = assignment.children.unwrap_or_default();
    core.vc = assignment.context.unwrap_or_default();
    core.version = value
        .get("version")
        .and_then(Value::as_str)
        .map(String::from);
    if value.get(STAMP).is_some() {
        core.sync_stamp = Some(AssignmentStamp {
            clock: assignment.clock.unwrap_or_default(),
            context: core.vc.clone(),
        });
    }
    Ok(core)
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_number_strings_match_javascript() {
        let fixtures =
            super::json::parse(include_str!("../tests/fixtures/number-strings.json")).unwrap();
        for item in fixtures.as_array().unwrap() {
            let super::Value::Number(value) = item.get("value").unwrap() else {
                panic!("numeric fixture");
            };
            assert_eq!(
                super::number_string(*value),
                item.get("expected").unwrap().as_str().unwrap(),
                "{value:?}"
            );
        }
    }
}
