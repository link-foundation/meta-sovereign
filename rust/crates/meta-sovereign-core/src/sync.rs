//! Deterministic register for the core's id/tokens/children/string-version shape.
//! Rank the original write, join observations, and union children independently.

use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fmt::{self, Write};

use crate::Link;

pub type VectorClock = BTreeMap<String, u64>;
const MAX_COUNTER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssignmentStamp {
    pub clock: VectorClock,
    pub context: VectorClock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncError {
    InvalidClock,
    InvalidValue,
}

impl fmt::Display for SyncError {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.write_str(match self {
            Self::InvalidClock => "SYNC_CLOCK_INVALID",
            Self::InvalidValue => "SYNC_VALUE_INVALID",
        })
    }
}
impl std::error::Error for SyncError {}

fn normalize(clock: &VectorClock) -> Result<VectorClock, SyncError> {
    if clock.values().any(|&n| n > MAX_COUNTER) {
        return Err(SyncError::InvalidClock);
    }
    Ok(clock
        .iter()
        .filter(|(_, n)| **n > 0)
        .map(|(k, n)| (k.clone(), *n))
        .collect())
}

pub fn try_vc_tick(clock: &VectorClock, actor: &str) -> Result<VectorClock, SyncError> {
    let mut next = normalize(clock)?;
    let before = next.get(actor).copied().unwrap_or(0);
    if actor.is_empty() || before == MAX_COUNTER {
        return Err(SyncError::InvalidClock);
    }
    next.insert(actor.to_owned(), before + 1);
    Ok(next)
}

pub fn try_vc_merge(a: &VectorClock, b: &VectorClock) -> Result<VectorClock, SyncError> {
    let mut next = normalize(a)?;
    for (actor, count) in normalize(b)? {
        let entry = next.entry(actor).or_insert(0);
        *entry = (*entry).max(count);
    }
    Ok(next)
}

/// `None` means concurrent; absent entries and explicit zeros are equal.
pub fn try_vc_compare(a: &VectorClock, b: &VectorClock) -> Result<Option<Ordering>, SyncError> {
    let a = normalize(a)?;
    let b = normalize(b)?;
    Ok(compare_clock(&a, &b))
}

fn compare_clock(a: &VectorClock, b: &VectorClock) -> Option<Ordering> {
    let mut greater = false;
    let mut less = false;
    for actor in a.keys().chain(b.keys()) {
        let av = a.get(actor).copied().unwrap_or(0);
        let bv = b.get(actor).copied().unwrap_or(0);
        greater |= av > bv;
        less |= av < bv;
    }
    match (greater, less) {
        (true, true) => None,
        (true, false) => Some(Ordering::Greater),
        (false, true) => Some(Ordering::Less),
        (false, false) => Some(Ordering::Equal),
    }
}

// Retain existing trusted-call APIs. Untrusted callers can propagate the
// corresponding try_* result instead of admitting invalid/exhausted counters.
pub fn vc_tick(clock: &VectorClock, actor: &str) -> VectorClock {
    try_vc_tick(clock, actor).expect("invalid synchronization clock")
}
pub fn vc_merge(a: &VectorClock, b: &VectorClock) -> VectorClock {
    try_vc_merge(a, b).expect("invalid synchronization clock")
}
pub fn vc_compare(a: &VectorClock, b: &VectorClock) -> Option<Ordering> {
    try_vc_compare(a, b).expect("invalid synchronization clock")
}

fn js_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

fn quoted(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if c < '\u{20}' => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn array_index(key: &str) -> Option<u32> {
    let n: u32 = key.parse().ok()?;
    (n < u32::MAX && n.to_string() == key).then_some(n)
}

// Object.fromEntries sorts actor names, but JSON.stringify enumerates canonical
// array-index properties first. Match that rule, including UTF-16 string order.
fn clock_key(clock: &VectorClock) -> String {
    let mut entries: Vec<_> = clock.iter().collect();
    entries.sort_by(|(a, _), (b, _)| match (array_index(a), array_index(b)) {
        (Some(a), Some(b)) => a.cmp(&b),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => js_cmp(a, b),
    });
    format!(
        "{{{}}}",
        entries
            .into_iter()
            .map(|(k, n)| format!("{}:{n}", quoted(k)))
            .collect::<Vec<_>>()
            .join(",")
    )
}

fn payload_key(link: &Link) -> String {
    let tokens = link
        .tokens
        .iter()
        .map(|t| format!("[\"string\",{}]", quoted(t)))
        .collect::<Vec<_>>()
        .join(",");
    let version = link
        .version
        .as_ref()
        .map(|v| format!(",[\"version\",[\"string\",{}]]", quoted(v)))
        .unwrap_or_default();
    format!(
        "[\"object\",[[\"id\",[\"string\",{}]],[\"tokens\",[\"array\",[{tokens}]]]{version}]]",
        quoted(&link.id)
    )
}

fn version(value: Option<&str>) -> (bool, &str, &str) {
    let text = value.unwrap_or("");
    let (digits, actor) = text.split_once('-').unwrap_or((text, ""));
    if !digits.is_empty()
        && digits.bytes().all(|c| c.is_ascii_digit())
        && !actor.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
    {
        let significant = digits.trim_start_matches('0');
        (
            true,
            if significant.is_empty() {
                "0"
            } else {
                significant
            },
            actor,
        )
    } else {
        (false, "0", text)
    }
}

fn compare_version(a: Option<&str>, b: Option<&str>) -> Ordering {
    let (at, an, aa) = version(a);
    let (bt, bn, ba) = version(b);
    at.cmp(&bt)
        .then_with(|| an.len().cmp(&bn.len()))
        .then_with(|| an.cmp(bn))
        .then_with(|| js_cmp(aa, ba))
}

struct Assignment<'a> {
    value: &'a Link,
    context: VectorClock,
    clock: VectorClock,
}

fn read(link: &Link) -> Result<Assignment<'_>, SyncError> {
    let context = normalize(&link.vc)?;
    let clock = if let Some(stamp) = &link.sync_stamp {
        let before = normalize(&stamp.context)?;
        let origin = normalize(&stamp.clock)?;
        match (
            compare_clock(&context, &before),
            compare_clock(&before, &origin),
        ) {
            (Some(Ordering::Equal), Some(Ordering::Equal | Ordering::Greater)) => origin,
            (Some(Ordering::Greater), Some(Ordering::Equal | Ordering::Greater)) => context.clone(),
            _ => return Err(SyncError::InvalidValue),
        }
    } else {
        context.clone()
    };
    Ok(Assignment {
        value: link,
        context,
        clock,
    })
}

fn compare(a: &Assignment<'_>, b: &Assignment<'_>) -> Ordering {
    let weight = |clock: &VectorClock| clock.values().map(|&n| u128::from(n)).sum::<u128>();
    weight(&a.clock)
        .cmp(&weight(&b.clock))
        .then_with(|| js_cmp(&clock_key(&a.clock), &clock_key(&b.clock)))
        .then_with(|| compare_version(a.value.version.as_deref(), b.value.version.as_deref()))
        .then_with(|| js_cmp(&payload_key(a.value), &payload_key(b.value)))
}

pub fn try_merge(a: &Link, b: &Link) -> Result<Link, SyncError> {
    if a.id != b.id {
        return Err(SyncError::InvalidValue);
    }
    let left = read(a)?;
    let right = read(b)?;
    let winner = if compare(&left, &right).is_lt() {
        &right
    } else {
        &left
    };
    let context = try_vc_merge(&left.context, &right.context)?;
    let mut next = winner.value.clone();
    next.sync_stamp =
        (compare_clock(&context, &winner.clock) != Some(Ordering::Equal)).then(|| {
            AssignmentStamp {
                clock: winner.clock.clone(),
                context: context.clone(),
            }
        });
    next.vc = context;
    next.children = a.children.iter().chain(&b.children).cloned().collect();
    next.children.sort_by(|a, b| js_cmp(a, b));
    next.children.dedup();
    Ok(next)
}

pub fn merge(a: &Link, b: &Link) -> Link {
    try_merge(a, b).expect("invalid synchronization value")
}
