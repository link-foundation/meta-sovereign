//! `meta-sovereign-core` — Rust counterpart of `src/storage` (R-G2).
//!
//! Today the crate exposes the [`Link`] type and a `MemoryStore` so
//! the workspace compiles green. Subsequent PRs add the LinoTextStore
//! and DoubletsStore (via `doublets-rs`) that mirror the JS API
//! one-to-one, so a Rust-only deployment of the server remains
//! feature-complete with the JS one.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    pub id: String,
    pub tokens: Vec<String>,
    pub children: Vec<String>,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip() {
        let mut s = MemoryStore::new();
        let l = Link {
            id: "a".into(),
            tokens: vec!["hello".into()],
            children: vec![],
        };
        s.put(l.clone());
        assert_eq!(s.get("a"), Some(&l));
        assert!(s.delete("a"));
        assert_eq!(s.query().len(), 0);
    }
}
