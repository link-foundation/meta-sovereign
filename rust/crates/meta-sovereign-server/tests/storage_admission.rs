use meta_sovereign_server::{
    ServerState,
    http::Request,
    json::{self, Value},
    routes::{self, MetricsCtx, StaticRoot},
    state::StatePersistence,
};
use std::collections::BTreeMap;
use std::io;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

#[derive(Default, Clone)]
struct Gate {
    failed: Arc<AtomicBool>,
    records: Arc<Mutex<Vec<Value>>>,
}
impl StatePersistence for Gate {
    fn commit(&mut self, records: Vec<&Value>) -> io::Result<()> {
        if self.failed.load(Ordering::SeqCst) {
            return Err(io::Error::other("injected persistence failure"));
        }
        *self.records.lock().unwrap() = records.into_iter().cloned().collect();
        Ok(())
    }
}
fn parse(text: &str) -> Value {
    json::parse(text).unwrap()
}
fn call(state: &ServerState, method: &str, path: &str, body: &str) -> u16 {
    let request = Request {
        method: method.into(),
        path: path.into(),
        query: BTreeMap::new(),
        headers: BTreeMap::new(),
        body: body.as_bytes().to_vec(),
    };
    routes::dispatch(
        state,
        &StaticRoot::new(None),
        &request,
        MetricsCtx::default(),
    )
    .status
}

#[test]
fn native_storage_failure_cannot_acknowledge_or_partially_admit_owner_and_remote_writes() {
    let gate = Gate::default();
    let state = ServerState::with_persistence(vec![], Box::new(gate.clone())).unwrap();
    let first = state
        .put_owner(&parse(r#"{"id":"first","body":"old"}"#))
        .unwrap();
    gate.failed.store(true, Ordering::SeqCst);
    assert!(
        state
            .put_many_owner(&[
                parse(r#"{"id":"first","body":"new"}"#),
                parse(r#"{"id":"second"}"#)
            ])
            .is_err()
    );
    assert!(state.delete_owner("first").is_err());
    assert!(
        state
            .apply_remote(&parse(r#"{"id":"remote","vc":{"r":2}}"#))
            .is_err()
    );
    assert_eq!(state.query(), vec![first.clone()]);
    assert_eq!(*gate.records.lock().unwrap(), vec![first]);
    gate.failed.store(false, Ordering::SeqCst);
    let next = state
        .put_owner(&parse(r#"{"id":"first","body":"retry"}"#))
        .unwrap();
    assert_eq!(
        next.get("vc").unwrap().as_object().unwrap().values().next(),
        Some(&Value::Number(2.0))
    );
    assert_eq!(*gate.records.lock().unwrap(), vec![next]);
}

#[test]
fn native_storage_http_and_email_report_unavailable_without_owner_mutation() {
    let gate = Gate::default();
    gate.failed.store(true, Ordering::SeqCst);
    let state = ServerState::with_persistence(vec![], Box::new(gate)).unwrap();
    for (method, path, body) in [
        ("PUT", "/links", r#"{"id":"first"}"#),
        ("DELETE", "/links/first", ""),
        (
            "POST",
            "/api/email/pull",
            r#"{"records":[{"id":"first","text":"mail"}]}"#,
        ),
        (
            "POST",
            "/api/email/send",
            r#"{"to":"fixture@example.test","text":"mail"}"#,
        ),
    ] {
        assert_eq!(call(&state, method, path, body), 503, "{path}");
    }
    assert_eq!(
        call(&state, "PUT", "/links", r#"{"id":"bad","vc":{"x":-1}}"#),
        400
    );
    assert!(state.is_empty());
}

#[test]
fn native_storage_restoration_keeps_clocks_and_private_deletion_is_fenced() {
    let original = parse(r#"{"id":"shared","vc":{"old":5},"body":"saved"}"#);
    let secret = parse(r#"{"id":"secret:key","body":"private"}"#);
    let gate = Gate::default();
    let state = ServerState::with_persistence(
        vec![original.clone(), secret.clone()],
        Box::new(gate.clone()),
    )
    .unwrap();
    assert_eq!(state.get("shared"), Some(original));
    gate.failed.store(true, Ordering::SeqCst);
    assert!(state.delete_owner("secret:key").is_err());
    assert_eq!(state.get("secret:key"), Some(secret));
    gate.failed.store(false, Ordering::SeqCst);
    assert!(state.delete_owner("secret:key").unwrap());
    assert_eq!(gate.records.lock().unwrap().len(), 1);
    assert!(
        ServerState::with_persistence(
            vec![parse(r#"{"id":"a"}"#), parse(r#"{"id":"a"}"#)],
            Box::new(Gate::default())
        )
        .is_err()
    );
}
