//! Bounded native live notifications. Overflow closes the connection so its
//! next schema-gated reconciliation can catch up; persistence stays admitted.
use crate::json::Value;
use std::collections::VecDeque;
use std::sync::{Condvar, Mutex};

#[derive(Default)]
struct Queue {
    events: VecDeque<(Value, usize)>,
    bytes: usize,
    closed: bool,
}

impl Queue {
    fn pop(&mut self) -> Option<Value> {
        if self.closed {
            return None;
        }
        let (event, bytes) = self.events.pop_front()?;
        self.bytes -= bytes;
        Some(event)
    }
}

#[derive(Default)]
pub struct ChangeFeed {
    queue: Mutex<Queue>,
    available: Condvar,
}

impl ChangeFeed {
    pub(crate) fn push(&self, event: &Value, bytes: usize) {
        let mut queue = self.queue.lock().expect("sync feed poisoned");
        if queue.closed {
            return;
        }
        if queue.events.len() >= 64 || queue.bytes.saturating_add(bytes) > 4 * 1024 * 1024 {
            queue.closed = true;
            queue.events.clear();
            queue.bytes = 0;
            if std::env::var("MS_SYNC_DEBUG").as_deref() == Ok("1") {
                eprintln!("[sync] live notification limit reached; reconnect required");
            }
        } else {
            queue.events.push_back((event.clone(), bytes));
            queue.bytes += bytes;
        }
        self.available.notify_one();
    }

    pub fn recv(&self) -> Option<Value> {
        let mut queue = self.queue.lock().expect("sync feed poisoned");
        loop {
            if queue.closed {
                return None;
            }
            if let Some(event) = queue.pop() {
                return Some(event);
            }
            queue = self.available.wait(queue).expect("sync feed poisoned");
        }
    }

    pub fn try_recv(&self) -> Option<Value> {
        self.queue.lock().expect("sync feed poisoned").pop()
    }

    pub fn close(&self) {
        let mut queue = self.queue.lock().expect("sync feed poisoned");
        queue.closed = true;
        queue.events.clear();
        queue.bytes = 0;
        self.available.notify_all();
    }

    pub(crate) fn is_open(&self) -> bool {
        !self.queue.lock().expect("sync feed poisoned").closed
    }
}
