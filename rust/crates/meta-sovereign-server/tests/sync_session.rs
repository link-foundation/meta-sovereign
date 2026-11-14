use meta_sovereign_server::{
    ServerState,
    json::{self, Value},
    state::StatePersistence,
    sync_session::SyncSession,
};
use std::io;
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};

fn value(text: &str) -> Value {
    json::parse(text).unwrap()
}
fn field(event: &Value, name: &str) -> Value {
    event.get(name).unwrap().clone()
}
fn edit(event: &Value, name: &str, next: Value) -> Value {
    let mut event = event.as_object().unwrap().clone();
    event.insert(name.into(), next);
    Value::Object(event)
}
fn hello(session: &mut SyncSession, state: &ServerState) -> (Value, Value) {
    let local = session.hello();
    let replies = session
        .receive(
            state,
            &value(r#"{"type":"hello","schema":15,"reconcile":1,"session":"javascript"}"#),
        )
        .unwrap();
    assert_eq!(replies.len(), 2);
    assert_eq!(
        replies[0].get("to"),
        Some(&Value::String("javascript".into()))
    );
    (local, replies[1].clone())
}
fn control(local: &Value, kind: &str, request: Value, sequence: u64) -> Value {
    Value::Object(
        [
            ("type".into(), Value::String(kind.into())),
            ("schema".into(), Value::Number(15.0)),
            ("from".into(), Value::String("javascript".into())),
            ("to".into(), field(local, "session")),
            ("request".into(), request),
            ("sequence".into(), Value::Number(sequence as f64)),
        ]
        .into(),
    )
}
struct Gate {
    fail: Arc<AtomicBool>,
    calls: Arc<AtomicUsize>,
}
impl StatePersistence for Gate {
    fn commit(&mut self, _: Vec<&Value>) -> io::Result<()> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        if self.fail.load(Ordering::SeqCst) {
            Err(io::Error::other("finite checkpoint failure"))
        } else {
            Ok(())
        }
    }
}

#[test]
fn native_session_requires_schema_and_hello_before_mutation() {
    let state = ServerState::new();
    let mut session = SyncSession::default();
    assert!(session.deadline().is_some());
    let mutation =
        value(r#"{"type":"put","schema":15,"link":{"id":"public","vc":{"js":1},"body":"saved"}}"#);
    assert!(session.receive(&state, &mutation).is_err());
    assert!(
        session
            .receive(
                &state,
                &value(r#"{"type":"hello","schema":15,"reconcile":1,"session":"invalid session"}"#)
            )
            .is_err()
    );
    assert!(
        session.receive(&state, &mutation).is_err(),
        "refused hello cannot enable admission"
    );
    assert!(
        session
            .receive(&state, &value(r#"{"type":"hello","schema":14}"#))
            .is_err()
    );
    assert!(state.is_empty());
    assert!(
        session
            .receive(&state, &value(r#"{"type":"hello","schema":15}"#))
            .unwrap()
            .is_empty()
    );
    assert!(session.deadline().is_none());
    assert!(session.receive(&state, &mutation).unwrap().is_empty());
    assert_eq!(state.get("public"), mutation.get("link").cloned());
    for record in [
        r#"{"type":"put","schema":15,"link":{"id":"secret:key"}}"#,
        r#"{"type":"put","schema":15,"link":{"id":"meta:schema"}}"#,
        r#"{"type":"delete","schema":15,"link":{"id":"public","vc":{"js":2}}}"#,
        r#"{"type":"put","schema":15,"link":{"id":"public","__msSyncDeleted":1,"vc":{"js":2}}}"#,
    ] {
        assert!(session.receive(&state, &value(record)).is_err());
    }
    assert_eq!(state.get("public"), mutation.get("link").cloned());
}

#[test]
fn native_session_acknowledges_only_committed_records_and_deduplicates() {
    let fail = Arc::new(AtomicBool::new(true));
    let calls = Arc::new(AtomicUsize::new(0));
    let state = ServerState::with_persistence(
        vec![],
        Box::new(Gate {
            fail: fail.clone(),
            calls: calls.clone(),
        }),
    )
    .unwrap();
    let mut session = SyncSession::default();
    let (local, pull) = hello(&mut session, &state);
    let mut event = control(&local, "sync-record", field(&pull, "request"), 0);
    event = edit(
        &event,
        "mutation",
        value(r#"{"type":"put","link":{"id":"saved","body":"once","vc":{"js":1}}}"#),
    );
    assert!(
        session.receive(&state, &event).is_err(),
        "no ACK on failed persistence"
    );
    assert!(state.get("saved").is_none());
    fail.store(false, Ordering::SeqCst);
    let ack = session.receive(&state, &event).unwrap();
    assert_eq!(ack.len(), 1);
    assert_eq!(ack[0].get("type").and_then(Value::as_str), Some("sync-ack"));
    assert_eq!(ack[0].get("sequence"), Some(&Value::Number(0.0)));
    assert_eq!(
        state.get("saved").unwrap().get("body"),
        Some(&Value::String("once".into()))
    );
    assert_eq!(session.receive(&state, &event).unwrap(), ack);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let future = edit(&event, "sequence", Value::Number(2.0));
    assert!(session.receive(&state, &future).is_err());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[test]
fn native_session_scans_one_record_until_matching_ack_and_bounds_opening_size() {
    let state = ServerState::new();
    state
        .put_owner(&value(r#"{"id":"a","body":"first"}"#))
        .unwrap();
    state.delete_owner("b").unwrap();
    state
        .put_owner(&value(r#"{"id":"secret:key","body":"private"}"#))
        .unwrap();
    state
        .put_owner(&value(r#"{"id":"meta:schema","version":13}"#))
        .unwrap();
    let mut session = SyncSession::default();
    let (local, incoming) = hello(&mut session, &state);
    let request = Value::String("scan".into());
    let pull = control(&local, "sync-pull", request.clone(), 0);
    let first = session.receive(&state, &pull).unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(
        first[0]
            .get("mutation")
            .unwrap()
            .get("link")
            .unwrap()
            .get("id")
            .and_then(Value::as_str),
        Some("a")
    );
    assert!(session.receive(&state, &pull).unwrap().is_empty());
    assert!(
        session
            .receive(&state, &control(&local, "sync-ack", request.clone(), 99))
            .unwrap()
            .is_empty()
    );
    state
        .put_owner(&value(
            r#"{"id":"aa","body":"a new middle key must not displace opening records"}"#,
        ))
        .unwrap();
    let second = session
        .receive(&state, &control(&local, "sync-ack", request.clone(), 0))
        .unwrap();
    assert_eq!(
        second[0]
            .get("mutation")
            .unwrap()
            .get("type")
            .and_then(Value::as_str),
        Some("delete")
    );
    assert_eq!(
        second[0]
            .get("mutation")
            .unwrap()
            .get("link")
            .unwrap()
            .get("body"),
        None
    );
    let finish = session
        .receive(&state, &control(&local, "sync-ack", request.clone(), 1))
        .unwrap();
    assert_eq!(
        finish[0].get("type").and_then(Value::as_str),
        Some("sync-finish")
    );
    assert!(session.deadline().is_some());
    assert!(
        session
            .receive(
                &state,
                &control(&local, "sync-finish", field(&incoming, "request"), 0)
            )
            .unwrap()
            .len()
            == 1
    );
    assert!(
        session
            .receive(&state, &control(&local, "sync-ack", request, 2))
            .unwrap()
            .is_empty()
    );
    assert!(session.deadline().is_none());
}

#[test]
fn native_session_controls_cannot_cross_sessions_or_restart_an_active_scan() {
    let state = ServerState::new();
    let mut session = SyncSession::default();
    let (local, _) = hello(&mut session, &state);
    let pull = control(&local, "sync-pull", Value::String("one".into()), 0);
    assert!(
        session
            .receive(&state, &edit(&pull, "from", Value::String("other".into())))
            .is_err()
    );
    assert!(
        session
            .receive(&state, &edit(&pull, "to", Value::String("other".into())))
            .unwrap()
            .is_empty()
    );
    assert_eq!(session.receive(&state, &pull).unwrap().len(), 1);
    assert!(
        session
            .receive(&state, &edit(&pull, "request", Value::String("two".into())))
            .is_err()
    );
    assert!(
        session
            .receive(
                &state,
                &value(r#"{"type":"hello","schema":15,"reconcile":1,"session":"other"}"#)
            )
            .is_err()
    );
    let other = SyncSession::default();
    assert_ne!(other.hello().get("session"), local.get("session"));
}

#[test]
fn native_session_live_feed_orders_owner_and_remote_changes_and_hides_private_records() {
    let state = ServerState::new();
    let left = state.subscribe_sync().unwrap();
    let right = state.subscribe_sync().unwrap();
    state
        .put_owner(&value(r#"{"id":"secret:key","body":"private"}"#))
        .unwrap();
    state
        .put_owner(&value(r#"{"id":"meta:schema","version":13}"#))
        .unwrap();
    assert!(left.try_recv().is_none());
    let saved = state
        .put_owner(&value(r#"{"id":"public","body":"owner"}"#))
        .unwrap();
    let event = left.try_recv().unwrap();
    assert_eq!(event.get("link"), Some(&saved));
    assert_eq!(right.try_recv(), Some(event));
    state.apply_remote(&saved).unwrap();
    assert!(
        left.try_recv().is_none(),
        "an echoed admitted value is not forwarded again"
    );
    state.delete_owner("public").unwrap();
    let event = left.try_recv().unwrap();
    assert_eq!(event.get("type").and_then(Value::as_str), Some("delete"));
    assert_eq!(event.get("link").unwrap().get("body"), None);
    assert!(state.get("public").is_none());
    assert_eq!(right.try_recv(), Some(event));
    let remote = value(r#"{"id":"remote","body":"from another peer","vc":{"other":1}}"#);
    state.apply_remote(&remote).unwrap();
    assert_eq!(left.try_recv().unwrap().get("link"), Some(&remote));
    assert_eq!(right.try_recv().unwrap().get("link"), Some(&remote));
    left.close();
    right.close();
}

#[test]
fn native_session_failed_checkpoint_does_not_publish_live_success() {
    let fail = Arc::new(AtomicBool::new(true));
    let state = ServerState::with_persistence(
        vec![],
        Box::new(Gate {
            fail: fail.clone(),
            calls: Arc::new(AtomicUsize::new(0)),
        }),
    )
    .unwrap();
    let feed = state.subscribe_sync().unwrap();
    let record = value(r#"{"id":"refused","body":"not admitted","vc":{"js":1}}"#);
    assert!(state.put_owner(&record).is_err());
    assert!(state.apply_remote(&record).is_err());
    assert!(state.delete_owner("refused").is_err());
    assert!(feed.try_recv().is_none());
    fail.store(false, Ordering::SeqCst);
    let saved = state.put_owner(&record).unwrap();
    assert_eq!(feed.try_recv().unwrap().get("link"), Some(&saved));
    feed.close();
    assert!(feed.recv().is_none());
}

#[test]
fn native_session_live_queues_and_subscribers_are_finite_and_reusable() {
    let state = ServerState::new();
    let mut feeds: Vec<_> = (0..16).map(|_| state.subscribe_sync().unwrap()).collect();
    assert!(state.subscribe_sync().is_err());
    feeds.pop().unwrap().close();
    let replacement = state.subscribe_sync().unwrap();
    for n in 0..65 {
        state
            .put_owner(&value(&format!(r#"{{"id":"bounded-{n}"}}"#)))
            .unwrap();
    }
    assert_eq!(
        state.len(),
        65,
        "slow delivery does not undo persisted owner writes"
    );
    assert!(
        replacement.try_recv().is_none(),
        "overflow requires a fresh reconciliation"
    );
    assert!(
        state.subscribe_sync().is_ok(),
        "retired queues do not exhaust slots"
    );
    for feed in feeds {
        feed.close();
    }
    replacement.close();
}
