//! Shared in-memory store wrapper used by every HTTP handler.
//!
//! The JS server owns a `createDualStore` that fronts both an indented
//! Links Notation file and a binary log. The Rust port keeps the same
//! shape — a thread-safe handle around `meta_sovereign_core::MemoryStore`
//! — so handlers that need read or write access do not have to know
//! anything about the storage backend.
//!
//! Every link is stored as a [`json::Value::Object`] so the server can
//! roundtrip the loose JSON shapes the SPA sends without a strict
//! schema. The link `id` is mirrored into the core store so vector-clock
//! merge and `meta-sovereign-core` queries continue to work.

use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard};

use meta_sovereign_core::{Link, MemoryStore};

use crate::json::{self, Value};

pub struct ServerState {
    inner: Mutex<Inner>,
}

struct Inner {
    /// Each entry stores the SPA-shaped JSON object so handlers can
    /// echo back exactly what was put in.
    links: BTreeMap<String, Value>,
    /// Mirror of the same payload in the core store, kept in sync so
    /// future code paths that need vector-clock merge can reach it.
    store: MemoryStore,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                links: BTreeMap::new(),
                store: MemoryStore::new(),
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().expect("state mutex poisoned")
    }

    pub fn put(&self, link: Value) -> Value {
        let mut g = self.lock();
        let id = link
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !id.is_empty() {
            let tokens: Vec<String> = link
                .get("tokens")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|t| t.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let mut core = Link::new(id.clone(), tokens);
            if let Some(children) = link.get("children").and_then(|v| v.as_array()) {
                core.children = children
                    .iter()
                    .filter_map(|c| c.as_str().map(String::from))
                    .collect();
            }
            g.store.put(core);
            g.links.insert(id, link.clone());
        }
        link
    }

    pub fn get(&self, id: &str) -> Option<Value> {
        self.lock().links.get(id).cloned()
    }

    pub fn delete(&self, id: &str) -> bool {
        let mut g = self.lock();
        let removed = g.links.remove(id).is_some();
        g.store.delete(id);
        removed
    }

    pub fn query(&self) -> Vec<Value> {
        self.lock().links.values().cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.lock().links.len()
    }

    pub fn is_empty(&self) -> bool {
        self.lock().links.is_empty()
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience constructor for an object link with id + tokens.
#[allow(dead_code)]
pub fn link_object(id: &str, tokens: &[&str]) -> Value {
    let mut o = json::obj();
    o.insert("id".into(), Value::String(id.into()));
    o.insert(
        "tokens".into(),
        Value::Array(tokens.iter().map(|t| Value::String((*t).into())).collect()),
    );
    Value::Object(o)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn put_and_get_round_trip() {
        let s = ServerState::new();
        let link = link_object("a:1", &["a"]);
        s.put(link.clone());
        assert_eq!(s.get("a:1"), Some(link));
    }

    #[test]
    fn delete_removes_entry() {
        let s = ServerState::new();
        s.put(link_object("a:1", &["a"]));
        assert!(s.delete("a:1"));
        assert_eq!(s.get("a:1"), None);
    }

    #[test]
    fn query_returns_all() {
        let s = ServerState::new();
        s.put(link_object("a:1", &["a"]));
        s.put(link_object("b:2", &["b"]));
        assert_eq!(s.query().len(), 2);
        assert_eq!(s.len(), 2);
    }
}
