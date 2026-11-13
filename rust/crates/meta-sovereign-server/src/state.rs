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
use std::collections::hash_map::RandomState;
use std::hash::BuildHasher;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};

use meta_sovereign_core::{Link, MemoryStore, SyncError};

use crate::json::{self, Value};
use crate::record_sync;

fn private(id: &str) -> bool {
    id.starts_with("secret:") || id == "meta:schema"
}

pub struct ServerState {
    inner: Mutex<Inner>,
    actor: String,
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
        // Writer identities are nonsecret collision-resistant names, not
        // authorization tokens. Include a process-local sequence as well as
        // fresh standard-library randomized hash keys for copied openings.
        static OPENING: AtomicU64 = AtomicU64::new(0);
        let sequence = OPENING.fetch_add(1, Ordering::Relaxed);
        let random = RandomState::new();
        let actor = format!(
            "writer:{:016x}{:016x}:{sequence}",
            random.hash_one((std::process::id(), sequence, "left")),
            random.hash_one((std::process::id(), sequence, "right"))
        );
        Self::with_actor(actor).expect("generated nonempty actor")
    }

    pub fn with_actor(actor: impl Into<String>) -> Result<Self, SyncError> {
        let actor = actor.into();
        meta_sovereign_core::try_vc_tick(&Default::default(), &actor)?;
        Ok(Self {
            inner: Mutex::new(Inner {
                links: BTreeMap::new(),
                store: MemoryStore::new(),
            }),
            actor,
        })
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
            // This trusted primitive preserves legacy restoration/fixture
            // behavior. Production writes use checked causal admission below.
            if let Ok(checked) = record_sync::core_link(&link) {
                core = checked;
            }
            g.store.put(core);
            g.links.insert(id, link.clone());
        }
        link
    }

    /// Atomic owner admission for production mutating endpoints. The primitive
    /// `put` remains available for trusted fixtures and restoration.
    pub fn put_owner(&self, link: &Value) -> Result<Value, SyncError> {
        Ok(self.put_many_owner(std::slice::from_ref(link))?.remove(0))
    }

    /// Prepare the whole finite batch before changing either representation.
    pub fn put_many_owner(&self, links: &[Value]) -> Result<Vec<Value>, SyncError> {
        let mut g = self.lock();
        let mut pending: BTreeMap<String, (Value, Link)> = BTreeMap::new();
        let mut admitted = Vec::with_capacity(links.len());
        for link in links {
            let id = link
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .ok_or(SyncError::InvalidValue)?;
            let before = pending
                .get(id)
                .map(|(value, _)| value)
                .or_else(|| g.links.get(id));
            let next = if private(id) {
                record_sync::merge(link, link)?;
                link.clone()
            } else {
                record_sync::assign(link, before, &self.actor)?
            };
            let core = record_sync::core_link(&next)?;
            admitted.push(next.clone());
            pending.insert(id.into(), (next, core));
        }
        for (id, (value, core)) in pending {
            g.store.put(core);
            g.links.insert(id, value);
        }
        Ok(admitted)
    }

    pub fn delete_owner(&self, id: &str) -> Result<bool, SyncError> {
        if id.is_empty() {
            return Err(SyncError::InvalidValue);
        }
        let mut g = self.lock();
        if private(id) {
            let existed = g.links.remove(id).is_some();
            g.store.delete(id);
            return Ok(existed);
        }
        let before = g.links.get(id);
        let existed = before.is_some_and(|value| !record_sync::is_deleted(value));
        let next = record_sync::deletion(id, before, &self.actor)?;
        let core = record_sync::core_link(&next)?;
        g.store.put(core);
        g.links.insert(id.into(), next);
        Ok(existed)
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
