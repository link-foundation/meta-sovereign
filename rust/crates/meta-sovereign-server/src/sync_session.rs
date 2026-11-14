//! One schema-gated native replica connection, with one scan record in flight.
//! Codecs and framing remain in `wire`; this module owns admission and controls.
use std::collections::hash_map::RandomState;
use std::hash::BuildHasher;
use std::io;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::json::Value;
use crate::record_sync;
use crate::state::ServerState;

pub const SCHEMA: f64 = 15.0;

fn id() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let sequence = NEXT.fetch_add(1, Ordering::Relaxed);
    let random = RandomState::new();
    format!(
        "n{:016x}{:016x}{sequence:x}",
        random.hash_one("left"),
        random.hash_one("right")
    )
}
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn string(value: &Value, name: &str) -> io::Result<String> {
    value
        .get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| invalid("sync control requires a string field"))
}
fn packet(kind: &str) -> std::collections::BTreeMap<String, Value> {
    [
        ("type".into(), Value::String(kind.into())),
        ("schema".into(), Value::Number(SCHEMA)),
    ]
    .into()
}

struct Scan {
    request: String,
    sequence: u64,
    remaining: usize,
    boundary: usize,
    after: Option<String>,
    finish_sent: bool,
    done: bool,
}

pub struct SyncSession {
    session: String,
    remote: Option<String>,
    matched: bool,
    request: String,
    received: u64,
    received_finish: bool,
    scan: Option<Scan>,
    deadline: Option<Instant>,
}

impl Default for SyncSession {
    fn default() -> Self {
        Self {
            session: id(),
            remote: None,
            matched: false,
            request: id(),
            received: 0,
            received_finish: false,
            scan: None,
            deadline: Some(Instant::now() + Duration::from_secs(30)),
        }
    }
}

impl SyncSession {
    pub fn matched(&self) -> bool {
        self.matched
    }
    pub fn hello(&self) -> Value {
        let mut event = packet("hello");
        event.insert("session".into(), Value::String(self.session.clone()));
        event.insert("reconcile".into(), Value::Number(1.0));
        Value::Object(event)
    }

    /// Only incomplete reconciliation has an idle deadline. Completed live
    /// connections stay open; a new connection gets a new session and scan.
    pub fn deadline(&self) -> Option<Instant> {
        self.deadline
    }

    pub fn abort(&self) -> Value {
        Value::Object(self.directed("sync-abort"))
    }

    fn touch(&mut self) {
        self.deadline = if self.received_finish && self.scan.as_ref().is_some_and(|s| s.done) {
            None
        } else {
            Some(Instant::now() + Duration::from_secs(30))
        };
    }

    fn directed(&self, kind: &str) -> std::collections::BTreeMap<String, Value> {
        let mut event = packet(kind);
        event.insert("from".into(), Value::String(self.session.clone()));
        if let Some(remote) = &self.remote {
            event.insert("to".into(), Value::String(remote.clone()));
        }
        event
    }

    fn next(&mut self, state: &ServerState) -> Value {
        let mut event = self.directed("sync-finish");
        let scan = self.scan.as_mut().expect("active scan");
        if scan.remaining > 0 {
            if let Some(record) = state.sync_next(scan.after.as_deref(), scan.boundary) {
                scan.remaining -= 1;
                scan.after = record.get("id").and_then(Value::as_str).map(str::to_owned);
                event.insert("type".into(), Value::String("sync-record".into()));
                event.insert(
                    "mutation".into(),
                    Value::Object(
                        [
                            (
                                "type".into(),
                                Value::String(
                                    if record_sync::is_deleted(&record) {
                                        "delete"
                                    } else {
                                        "put"
                                    }
                                    .into(),
                                ),
                            ),
                            ("link".into(), record),
                        ]
                        .into(),
                    ),
                );
            } else {
                scan.finish_sent = true;
            }
        } else {
            scan.finish_sent = true;
        }
        event.insert("request".into(), Value::String(scan.request.clone()));
        event.insert("sequence".into(), Value::Number(scan.sequence as f64));
        Value::Object(event)
    }

    fn admit(state: &ServerState, mutation: &Value) -> io::Result<()> {
        let kind = string(mutation, "type")?;
        let record = mutation
            .get("link")
            .ok_or_else(|| invalid("sync mutation requires a link"))?;
        if !matches!(kind.as_str(), "put" | "delete")
            || (kind == "delete") != record_sync::is_deleted(record)
        {
            return Err(invalid("sync mutation and deletion marker disagree"));
        }
        state.apply_remote(record).map_err(|error| {
            if error.status() == 400 {
                invalid(&error.to_string())
            } else {
                io::Error::from(error)
            }
        })?;
        Ok(())
    }

    pub fn receive(&mut self, state: &ServerState, event: &Value) -> io::Result<Vec<Value>> {
        if event
            .get("to")
            .is_some_and(|to| to.as_str() != Some(&self.session))
        {
            return Ok(vec![]);
        }
        if event.get("schema") != Some(&Value::Number(SCHEMA)) {
            return Err(invalid(
                "SCHEMA_MISMATCH: native data schema is 15; no record admitted",
            ));
        }
        let kind = string(event, "type")?;
        if kind == "hello" {
            if event.get("reconcile") != Some(&Value::Number(1.0)) {
                self.matched = true;
                if self.remote.is_none() {
                    self.deadline = None;
                }
                return Ok(vec![]);
            }
            let remote = string(event, "session")?;
            if !valid_id(&remote)
                || remote == self.session
                || self.remote.as_ref().is_some_and(|old| old != &remote)
            {
                return Err(invalid("invalid or changed sync session"));
            }
            self.matched = true;
            if self.remote.is_some() {
                return Ok(vec![]);
            }
            self.remote = Some(remote);
            self.touch();
            let mut result = Vec::new();
            if event.get("to").is_none() {
                let mut hello = self.hello().as_object().unwrap().clone();
                hello.extend(self.directed("hello"));
                result.push(Value::Object(hello));
            }
            let mut pull = self.directed("sync-pull");
            pull.insert("request".into(), Value::String(self.request.clone()));
            result.push(Value::Object(pull));
            return Ok(result);
        }
        if !self.matched {
            return Err(invalid("sync requires a matching hello before records"));
        }
        if matches!(kind.as_str(), "put" | "delete") {
            Self::admit(state, event)?;
            return Ok(vec![]);
        }
        if event.get("to").and_then(Value::as_str) != Some(&self.session)
            || self.remote.is_none()
            || event.get("from").and_then(Value::as_str) != self.remote.as_deref()
        {
            return Err(invalid(
                "sync controls require the negotiated addressed session",
            ));
        }
        if kind == "sync-abort" {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionAborted,
                "remote reconciliation aborted",
            ));
        }
        let request = string(event, "request")?;
        if !valid_id(&request) {
            return Err(invalid("invalid sync request"));
        }
        if kind == "sync-pull" {
            if let Some(scan) = &self.scan {
                return if scan.request == request {
                    Ok(vec![])
                } else {
                    Err(invalid("a sync scan is already active"))
                };
            }
            let boundary = state.sync_boundary();
            self.scan = Some(Scan {
                request,
                sequence: 0,
                remaining: boundary,
                boundary,
                after: None,
                finish_sent: false,
                done: false,
            });
            self.touch();
            return Ok(vec![self.next(state)]);
        }
        let sequence = match event.get("sequence") {
            Some(Value::Number(n))
                if n.is_finite()
                    && *n >= 0.0
                    && *n <= 9_007_199_254_740_990.0
                    && n.fract() == 0.0 =>
            {
                *n as u64
            }
            _ => return Err(invalid("invalid sync sequence")),
        };
        if kind == "sync-ack" {
            if let Some(scan) = &mut self.scan
                && scan.request == request
                && scan.sequence == sequence
                && !scan.done
            {
                scan.sequence += 1;
                if scan.finish_sent {
                    scan.done = true;
                    self.touch();
                    return Ok(vec![]);
                }
                self.touch();
                return Ok(vec![self.next(state)]);
            }
            return Ok(vec![]);
        }
        if !matches!(kind.as_str(), "sync-record" | "sync-finish") {
            return Err(invalid("unsupported sync control"));
        }
        if request != self.request || self.received_finish {
            return Ok(vec![]);
        }
        if sequence > self.received {
            return Err(invalid("sync sequence is ahead of admission"));
        }
        if sequence == self.received {
            if kind == "sync-record" {
                Self::admit(
                    state,
                    event
                        .get("mutation")
                        .ok_or_else(|| invalid("sync record requires a mutation"))?,
                )?;
            } else {
                self.received_finish = true;
            }
            self.received += 1;
        }
        self.touch();
        let mut ack = self.directed("sync-ack");
        ack.insert("request".into(), Value::String(request));
        ack.insert("sequence".into(), Value::Number(sequence as f64));
        Ok(vec![Value::Object(ack)])
    }
}
