//! `meta-sovereign-core` — Rust counterpart of `src/storage` (R-G2).
//!
//! Targets one-to-one parity with the JS reference implementation so a
//! Rust-only deployment of the server stays feature-complete:
//!
//! - [`Link`] mirrors the JS link shape (`id`, `tokens`, `children`).
//! - [`MemoryStore`] is the in-memory equivalent of `createMemoryStore`.
//! - [`parse_lino`] / [`format_lino`] round-trip indented Links Notation
//!   the same way `src/storage/lino.js` does.
//! - [`LinoTextStore`] persists links as indented Links Notation, the
//!   Rust counterpart of `createLinoTextStore`.
//! - [`vc_merge`], [`vc_compare`], and [`merge`] mirror the vector-clock
//!   CRDT primitives in `src/sync/index.js`.

#![forbid(unsafe_code)]

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    pub id: String,
    pub tokens: Vec<String>,
    pub children: Vec<String>,
    pub vc: BTreeMap<String, u64>,
}

impl Link {
    pub fn new<I, T>(id: impl Into<String>, tokens: I) -> Self
    where
        I: IntoIterator<Item = T>,
        T: Into<String>,
    {
        Self {
            id: id.into(),
            tokens: tokens.into_iter().map(Into::into).collect(),
            children: Vec::new(),
            vc: BTreeMap::new(),
        }
    }
}

#[derive(Default)]
pub struct MemoryStore {
    data: HashMap<String, Link>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn put(&mut self, link: Link) {
        self.data.insert(link.id.clone(), link);
    }
    pub fn get(&self, id: &str) -> Option<&Link> {
        self.data.get(id)
    }
    pub fn delete(&mut self, id: &str) -> bool {
        self.data.remove(id).is_some()
    }
    pub fn query(&self) -> Vec<&Link> {
        self.data.values().collect()
    }
    pub fn len(&self) -> usize {
        self.data.len()
    }
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

// -- Indented Links Notation -------------------------------------------------

const INDENT: &str = "  ";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinoNode {
    pub tokens: Vec<String>,
    pub children: Vec<LinoNode>,
}

fn tokenize(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut buf = String::new();
    let mut quoted = false;
    for ch in line.chars() {
        if ch == '"' {
            quoted = !quoted;
            buf.push(ch);
            continue;
        }
        if !quoted && (ch == ' ' || ch == '\t') {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
            continue;
        }
        buf.push(ch);
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }
    tokens
        .into_iter()
        .map(|t| {
            if t.starts_with('"') && t.ends_with('"') && t.len() >= 2 {
                t[1..t.len() - 1].to_string()
            } else {
                t
            }
        })
        .collect()
}

fn format_token(t: &str) -> String {
    if t.is_empty() || t.chars().any(|c| c.is_whitespace() || c == '"') {
        format!("\"{}\"", t.replace('"', "\\\""))
    } else {
        t.to_string()
    }
}

pub fn parse_lino(text: &str) -> Vec<LinoNode> {
    // Path-based traversal keeps the implementation safe: the stack
    // stores indices into successive `children` vectors so we can walk
    // from the root to the parent without holding raw pointers.
    let mut root = LinoNode {
        tokens: Vec::new(),
        children: Vec::new(),
    };
    // (depth, child-index-at-that-depth) pairs.
    let mut stack: Vec<(i32, usize)> = vec![(-1, 0)];
    for raw in text.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }
        let indent = raw.len() - raw.trim_start().len();
        let depth = (indent / INDENT.len()) as i32;
        let node = LinoNode {
            tokens: tokenize(trimmed),
            children: Vec::new(),
        };
        while stack.last().map(|&(d, _)| d >= depth).unwrap_or(false) {
            stack.pop();
        }
        // Walk from the root through the index path to the parent.
        let path: Vec<usize> = stack.iter().skip(1).map(|&(_, i)| i).collect();
        let mut parent: &mut LinoNode = &mut root;
        for idx in &path {
            parent = &mut parent.children[*idx];
        }
        let new_index = parent.children.len();
        parent.children.push(node);
        stack.push((depth, new_index));
    }
    root.children
}

fn format_node(node: &LinoNode, depth: usize, out: &mut String) {
    out.push_str(&INDENT.repeat(depth));
    let line: Vec<String> = node.tokens.iter().map(|t| format_token(t)).collect();
    out.push_str(&line.join(" "));
    out.push('\n');
    for c in &node.children {
        format_node(c, depth + 1, out);
    }
}

pub fn format_lino(nodes: &[LinoNode]) -> String {
    let mut out = String::new();
    for n in nodes {
        format_node(n, 0, &mut out);
    }
    out
}

// -- LinoTextStore ----------------------------------------------------------

pub struct LinoTextStore {
    path: PathBuf,
    store: MemoryStore,
}

impl LinoTextStore {
    pub fn open(path: impl Into<PathBuf>) -> io::Result<Self> {
        let path = path.into();
        let mut store = MemoryStore::new();
        if path.exists() {
            let text = fs::read_to_string(&path)?;
            for node in parse_lino(&text) {
                if let Some(id) = node.tokens.get(2).cloned() {
                    store.put(Link {
                        id: id.clone(),
                        tokens: node.tokens.clone(),
                        children: node
                            .children
                            .iter()
                            .map(|c| c.tokens.join(" "))
                            .collect(),
                        vc: BTreeMap::new(),
                    });
                }
            }
        }
        Ok(Self { path, store })
    }

    pub fn put(&mut self, link: Link) -> io::Result<()> {
        self.store.put(link);
        self.flush()
    }

    pub fn get(&self, id: &str) -> Option<&Link> {
        self.store.get(id)
    }

    pub fn delete(&mut self, id: &str) -> io::Result<bool> {
        let ok = self.store.delete(id);
        if ok {
            self.flush()?;
        }
        Ok(ok)
    }

    pub fn query(&self) -> Vec<&Link> {
        self.store.query()
    }

    fn flush(&self) -> io::Result<()> {
        let nodes: Vec<LinoNode> = self
            .store
            .query()
            .into_iter()
            .map(|l| LinoNode {
                tokens: l.tokens.clone(),
                children: l
                    .children
                    .iter()
                    .map(|c| LinoNode {
                        tokens: vec![c.clone()],
                        children: Vec::new(),
                    })
                    .collect(),
            })
            .collect();
        fs::write(&self.path, format_lino(&nodes))
    }
}

// -- Vector-clock CRDT ------------------------------------------------------

pub type VectorClock = BTreeMap<String, u64>;

pub fn vc_tick(vc: &VectorClock, node: &str) -> VectorClock {
    let mut out = vc.clone();
    *out.entry(node.to_string()).or_insert(0) += 1;
    out
}

pub fn vc_merge(a: &VectorClock, b: &VectorClock) -> VectorClock {
    let mut out = a.clone();
    for (k, &v) in b {
        let entry = out.entry(k.clone()).or_insert(0);
        *entry = (*entry).max(v);
    }
    out
}

/// Returns `Some(Ordering::Greater)` when `a` dominates `b`, `Less`
/// when `b` dominates, `Equal` when identical. `None` means concurrent.
pub fn vc_compare(a: &VectorClock, b: &VectorClock) -> Option<Ordering> {
    let mut keys: HashSet<&String> = a.keys().collect();
    keys.extend(b.keys());
    let mut a_strict = false;
    let mut b_strict = false;
    for k in keys {
        let av = a.get(k).copied().unwrap_or(0);
        let bv = b.get(k).copied().unwrap_or(0);
        if av > bv {
            a_strict = true;
        }
        if bv > av {
            b_strict = true;
        }
    }
    match (a_strict, b_strict) {
        (false, false) => Some(Ordering::Equal),
        (true, false) => Some(Ordering::Greater),
        (false, true) => Some(Ordering::Less),
        (true, true) => None,
    }
}

fn tiebreak<'a>(a: &'a Link, b: &'a Link) -> &'a Link {
    let a_top = a.vc.iter().max_by_key(|(_, v)| *v).map(|(k, _)| k.clone()).unwrap_or_default();
    let b_top = b.vc.iter().max_by_key(|(_, v)| *v).map(|(k, _)| k.clone()).unwrap_or_default();
    if a_top != b_top {
        return if a_top > b_top { a } else { b };
    }
    if format!("{:?}", a) >= format!("{:?}", b) {
        a
    } else {
        b
    }
}

pub fn merge(a: &Link, b: &Link) -> Link {
    let chosen = match vc_compare(&a.vc, &b.vc) {
        Some(Ordering::Greater) => a.clone(),
        Some(Ordering::Less) => b.clone(),
        Some(Ordering::Equal) => a.clone(),
        None => tiebreak(a, b).clone(),
    };
    let mut child_set: HashSet<String> = chosen.children.iter().cloned().collect();
    child_set.extend(a.children.iter().cloned());
    child_set.extend(b.children.iter().cloned());
    Link {
        id: chosen.id,
        tokens: chosen.tokens,
        children: child_set.into_iter().collect(),
        vc: vc_merge(&a.vc, &b.vc),
    }
}

// -- Patterns ---------------------------------------------------------------

fn escape_regex(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if matches!(
            ch,
            '.' | '*'
                | '+'
                | '?'
                | '^'
                | '$'
                | '{'
                | '}'
                | '('
                | ')'
                | '|'
                | '['
                | ']'
                | '\\'
        ) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn tokenise_pattern(s: &str) -> Vec<String> {
    s.split_whitespace().map(|t| t.to_string()).collect()
}

/// Example-driven regex synthesis (R-C1) — Rust mirror of `inferRegex` in
/// `src/patterns/index.js`. Returns the regex source string plus the `i`
/// flag; the caller can compile it with the regex crate of their choice
/// (or our minimal [`pattern_matches`] helper below).
pub fn infer_regex(examples: &[&str]) -> String {
    if examples.is_empty() {
        return String::new();
    }
    let toks: Vec<Vec<String>> = examples.iter().map(|e| tokenise_pattern(e)).collect();
    let len = toks[0].len();
    if !toks.iter().all(|t| t.len() == len) {
        let alts: Vec<String> = examples.iter().map(|e| escape_regex(e)).collect();
        return format!("^(?:{})$", alts.join("|"));
    }
    let mut parts: Vec<String> = Vec::with_capacity(len);
    for i in 0..len {
        let col: Vec<&String> = toks.iter().map(|t| &t[i]).collect();
        if col.iter().all(|c| **c == *col[0]) {
            parts.push(escape_regex(col[0]));
        } else {
            parts.push("\\S+".to_string());
        }
    }
    format!("^{}$", parts.join("\\s+"))
}

/// Replace a run of `(\\S+\\s+){2,}` with `(?:\\S+\\s+){n}` for
/// readability — mirrors `simplifyRegex` in JS.
pub fn simplify_regex(src: &str) -> String {
    let unit = "\\S+\\s+";
    let mut out = String::new();
    let mut rest = src;
    while let Some(idx) = rest.find(unit) {
        out.push_str(&rest[..idx]);
        let mut count = 0;
        let mut probe = &rest[idx..];
        while probe.starts_with(unit) {
            count += 1;
            probe = &probe[unit.len()..];
        }
        if count >= 2 {
            out.push_str(&format!("(?:\\S+\\s+){{{count}}}"));
        } else {
            out.push_str(unit);
        }
        rest = probe;
    }
    out.push_str(rest);
    out
}

/// Tiny matcher that supports just the constructs `infer_regex` emits
/// (`^`, `$`, literals, `\\S+`, `\\s+`) so the pure-Rust core can run
/// the patterns end-to-end without pulling in the `regex` crate. For
/// production callers we recommend wiring the same source string into
/// the upstream `regex` crate; this helper exists for fixture parity
/// with the JS implementation in tests.
pub fn pattern_matches(source: &str, input: &str) -> bool {
    let mut chars: Vec<char> = source.chars().collect();
    let anchored_start = chars.first() == Some(&'^');
    let anchored_end = chars.last() == Some(&'$');
    if anchored_start {
        chars.remove(0);
    }
    if anchored_end {
        chars.pop();
    }
    let pat: String = chars.into_iter().collect();
    if !anchored_start || !anchored_end {
        // Conservative fallback: substring contains.
        return input.contains(&pat.replace('\\', ""));
    }
    let mut pi = 0usize;
    let mut si = 0usize;
    let pat_bytes: Vec<char> = pat.chars().collect();
    let in_bytes: Vec<char> = input.chars().collect();
    while pi < pat_bytes.len() {
        if pi + 2 < pat_bytes.len() && pat_bytes[pi] == '\\' && pat_bytes[pi + 1] == 'S' && pat_bytes[pi + 2] == '+' {
            let mut consumed = 0;
            while si + consumed < in_bytes.len() && !in_bytes[si + consumed].is_whitespace() {
                consumed += 1;
            }
            if consumed == 0 {
                return false;
            }
            si += consumed;
            pi += 3;
            continue;
        }
        if pi + 2 < pat_bytes.len() && pat_bytes[pi] == '\\' && pat_bytes[pi + 1] == 's' && pat_bytes[pi + 2] == '+' {
            let mut consumed = 0;
            while si + consumed < in_bytes.len() && in_bytes[si + consumed].is_whitespace() {
                consumed += 1;
            }
            if consumed == 0 {
                return false;
            }
            si += consumed;
            pi += 3;
            continue;
        }
        if pat_bytes[pi] == '\\' && pi + 1 < pat_bytes.len() {
            // Escaped literal.
            if si >= in_bytes.len() || in_bytes[si] != pat_bytes[pi + 1] {
                return false;
            }
            si += 1;
            pi += 2;
            continue;
        }
        if si >= in_bytes.len()
            || in_bytes[si].to_ascii_lowercase() != pat_bytes[pi].to_ascii_lowercase()
        {
            return false;
        }
        si += 1;
        pi += 1;
    }
    si == in_bytes.len()
}

// -- Tests ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_round_trip() {
        let mut s = MemoryStore::new();
        let l = Link::new("a", ["hello"]);
        s.put(l.clone());
        assert_eq!(s.get("a"), Some(&l));
        assert!(s.delete("a"));
        assert_eq!(s.query().len(), 0);
    }

    #[test]
    fn lino_round_trip() {
        let text = "message telegram 1\n  sender:telegram:me\n  body:telegram:1\n";
        let parsed = parse_lino(text);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].tokens, vec!["message", "telegram", "1"]);
        assert_eq!(parsed[0].children.len(), 2);
        let formatted = format_lino(&parsed);
        assert_eq!(formatted, text);
    }

    #[test]
    fn vc_dominance() {
        let a: VectorClock = [("x".into(), 2u64)].into_iter().collect();
        let b: VectorClock = [("x".into(), 1u64)].into_iter().collect();
        assert_eq!(vc_compare(&a, &b), Some(Ordering::Greater));
        assert_eq!(vc_compare(&b, &a), Some(Ordering::Less));
    }

    #[test]
    fn vc_concurrent_is_none() {
        let a: VectorClock = [("x".into(), 1u64)].into_iter().collect();
        let b: VectorClock = [("y".into(), 1u64)].into_iter().collect();
        assert_eq!(vc_compare(&a, &b), None);
    }

    #[test]
    fn merge_picks_dominant_clock() {
        let mut a = Link::new("k", ["alpha"]);
        a.vc.insert("n1".into(), 2);
        let mut b = Link::new("k", ["beta"]);
        b.vc.insert("n1".into(), 1);
        let m = merge(&a, &b);
        assert_eq!(m.tokens, vec!["alpha"]);
        assert_eq!(m.vc.get("n1"), Some(&2));
    }

    #[test]
    fn merge_unions_children() {
        let mut a = Link::new("k", ["x"]);
        a.children.push("c1".into());
        let mut b = Link::new("k", ["y"]);
        b.children.push("c2".into());
        let m = merge(&a, &b);
        assert!(m.children.contains(&"c1".to_string()));
        assert!(m.children.contains(&"c2".to_string()));
    }

    #[test]
    fn lino_text_store_persists() {
        let dir = std::env::temp_dir().join(format!("ms-rs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("data.lino");
        let _ = std::fs::remove_file(&path);
        {
            let mut s = LinoTextStore::open(&path).unwrap();
            let mut l = Link::new("k", ["a", "b", "k"]);
            l.children.push("child:1".into());
            s.put(l).unwrap();
        }
        let s2 = LinoTextStore::open(&path).unwrap();
        assert!(s2.get("k").is_some());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn infer_regex_aligns_columns() {
        let r = infer_regex(&["where are you from", "where are you going"]);
        assert_eq!(r, "^where\\s+are\\s+you\\s+\\S+$");
    }

    #[test]
    fn infer_regex_falls_back_to_alternation_on_length_mismatch() {
        let r = infer_regex(&["hi", "hello world"]);
        assert!(r.starts_with("^(?:"));
        assert!(r.ends_with(")$"));
        assert!(r.contains("hi"));
        assert!(r.contains("hello world"));
    }

    #[test]
    fn infer_regex_empty_input_is_empty_string() {
        assert_eq!(infer_regex(&[]), "");
    }

    #[test]
    fn simplify_regex_collapses_repeats() {
        let src = "^a\\s+\\S+\\s+\\S+\\s+\\S+\\s+b$";
        let simplified = simplify_regex(src);
        assert!(simplified.contains("(?:\\S+\\s+){3}"));
    }

    #[test]
    fn simplify_regex_leaves_singletons_alone() {
        let src = "^a\\s+\\S+\\s+b$";
        assert_eq!(simplify_regex(src), src);
    }

    #[test]
    fn pattern_matches_anchored_literal() {
        assert!(pattern_matches("^hello$", "hello"));
        assert!(!pattern_matches("^hello$", "hello world"));
    }

    #[test]
    fn pattern_matches_with_word_class() {
        let pat = infer_regex(&["where are you from", "where are you going"]);
        assert!(pattern_matches(&pat, "where are you from"));
        assert!(pattern_matches(&pat, "where are you going"));
        assert!(!pattern_matches(&pat, "what time is it"));
    }
}
