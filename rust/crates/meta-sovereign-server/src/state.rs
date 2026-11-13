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

use meta_sovereign_core::{Link, MemoryStore, SyncError};

use crate::json::{self, Value};
use crate::record_sync;

fn private(id: &str) -> bool {
    id.starts_with("secret:") || id == "meta:schema"
}

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
            // Invalid legacy owner inputs still follow the existing owner API;
            // checked replicated admission below rejects them before mutation.
            if let Ok(checked) = record_sync::core_link(&link) {
                core = checked;
            }
            g.store.put(core);
            g.links.insert(id, link.clone());
        }
        link
    }

    pub fn get(&self, id: &str) -> Option<Value> {
        self.lock()
            .links
            .get(id)
            .filter(|v| !record_sync::is_deleted(v))
            .cloned()
    }

    /// Atomically admit one already received replica record. This operation
    /// makes no durability or transport acknowledgement claim. Secrets and the
    /// local schema marker never enter through replicated admission.
    pub fn apply_remote(&self, record: &Value) -> Result<Value, SyncError> {
        let id = record
            .get("id")
            .and_then(Value::as_str)
            .ok_or(SyncError::InvalidValue)?;
        if id.is_empty() || private(id) {
            return Err(SyncError::InvalidValue);
        }
        let admitted = record_sync::merge(record, record)?;
        let mut g = self.lock();
        let next = match g.links.get(id) {
            Some(current) => record_sync::merge(current, &admitted)?,
            None => admitted,
        };
        let core = record_sync::core_link(&next)?;
        g.store.put(core);
        g.links.insert(id.into(), next.clone());
        Ok(next)
    }

    /// Raw public replica records, including payload-free deletion clocks.
    pub fn sync_records(&self) -> Vec<Value> {
        self.lock()
            .links
            .iter()
            .filter(|(id, _)| !private(id))
            .map(|(_, value)| value.clone())
            .collect()
    }

    pub fn delete(&self, id: &str) -> bool {
        let mut g = self.lock();
        let removed = g.links.remove(id).is_some();
        g.store.delete(id);
        removed
    }

    pub fn query(&self) -> Vec<Value> {
        self.lock()
            .links
            .values()
            .filter(|v| !record_sync::is_deleted(v))
            .cloned()
            .collect()
    }

    pub fn len(&self) -> usize {
        self.lock()
            .links
            .values()
            .filter(|v| !record_sync::is_deleted(v))
            .count()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
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

// Native rich-record admission regressions. The exact-parent probe appends
// this unchanged-API module to the published state source.
#[cfg(test)]
mod replicated_mirror_tests {
    use super::*;

    fn saved() -> ServerState {
        let state = ServerState::new();
        state.put(json::parse(r#"{"id":"shared","tokens":["body"],"vc":{"a":2,"b":1},"version":"10-a","__msSyncStamp":{"version":1,"clock":{"a":2},"context":{"a":2,"b":1}}}"#).unwrap());
        state
    }

    #[test]
    fn native_parent_mirror_retains_vector() {
        let state = saved();
        assert_eq!(
            state.lock().store.get("shared").unwrap().vc,
            [("a".into(), 2), ("b".into(), 1)].into_iter().collect()
        );
    }
    #[test]
    fn native_parent_mirror_retains_assignment() {
        let state = saved();
        let g = state.lock();
        let stamp = g.store.get("shared").unwrap().sync_stamp.as_ref().unwrap();
        assert_eq!(stamp.clock, [("a".into(), 2)].into_iter().collect());
        assert_eq!(stamp.context, g.store.get("shared").unwrap().vc);
    }
    #[test]
    fn native_parent_mirror_retains_version() {
        assert_eq!(
            saved()
                .lock()
                .store
                .get("shared")
                .unwrap()
                .version
                .as_deref(),
            Some("10-a")
        );
    }
    #[test]
    fn native_parent_public_reads_hide_deletion_metadata() {
        let state = ServerState::new();
        state.put(json::parse(r#"{"id":"shared","__msSyncDeleted":1,"vc":{"a":2}}"#).unwrap());
        assert_eq!(state.get("shared"), None);
        assert!(state.query().is_empty());
        assert_eq!(state.len(), 0);
        assert!(state.is_empty());
    }
}
