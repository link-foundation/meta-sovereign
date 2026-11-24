use meta_sovereign_server::{
    ServerState,
    http::{Request, Response},
    json::{self, Value},
    routes::{self, MetricsCtx, StaticRoot},
};
use std::collections::BTreeMap;

fn parse(text: &str) -> Value {
    json::parse(text).unwrap()
}
fn request(method: &str, path: &str, body: &str) -> Request {
    Request {
        method: method.into(),
        path: path.into(),
        query: BTreeMap::new(),
        headers: BTreeMap::new(),
        body: body.as_bytes().to_vec(),
    }
}
fn owner(state: &ServerState, method: &str, body: &str) -> Response {
    let path = if method == "DELETE" {
        "/links/shared"
    } else {
        "/links"
    };
    dispatch(state, method, path, body)
}
fn dispatch(state: &ServerState, method: &str, path: &str, body: &str) -> Response {
    routes::dispatch(
        state,
        &StaticRoot::new(None),
        &request(method, path, body),
        MetricsCtx::default(),
    )
}
fn old() -> Value {
    parse(r#"{"id":"shared","body":"old","vc":{"remote":5}}"#)
}

#[test]
fn native_owner_http_edit_survives_stale_remote_packet() {
    let state = ServerState::new();
    state.apply_remote(&old()).unwrap();
    assert_eq!(
        owner(&state, "PUT", r#"{"id":"shared","body":"edited"}"#).status,
        200
    );
    state.apply_remote(&old()).unwrap();
    assert_eq!(
        state.get("shared").unwrap().get("body"),
        Some(&Value::String("edited".into()))
    );
}

#[test]
fn native_owner_http_delete_survives_stale_remote_packet() {
    let state = ServerState::new();
    state.apply_remote(&old()).unwrap();
    assert_eq!(owner(&state, "DELETE", "").status, 200);
    state.apply_remote(&old()).unwrap();
    assert_eq!(state.get("shared"), None);
}

#[test]
fn native_owner_http_recreation_survives_old_delete() {
    let state = ServerState::new();
    let deletion = parse(r#"{"id":"shared","__msSyncDeleted":1,"vc":{"remote":6}}"#);
    state.apply_remote(&deletion).unwrap();
    assert_eq!(
        owner(&state, "PUT", r#"{"id":"shared","body":"recreated"}"#).status,
        200
    );
    state.apply_remote(&deletion).unwrap();
    assert_eq!(
        state.get("shared").unwrap().get("body"),
        Some(&Value::String("recreated".into()))
    );
}

#[test]
fn native_owner_http_returns_the_admitted_clock() {
    let state = ServerState::new();
    let response = owner(&state, "PUT", r#"{"id":"shared","body":"new"}"#);
    assert_eq!(response.status, 200);
    let saved = parse(&response.body_string());
    assert_eq!(saved, state.get("shared").unwrap());
    let clock = saved.get("vc").unwrap().as_object().unwrap();
    assert_eq!(clock.len(), 1);
    assert!(clock.keys().next().unwrap().starts_with("writer:"));
    assert_eq!(clock.values().next(), Some(&Value::Number(1.0)));
}

// Checked owner refusals.
#[test]
fn native_owner_batch_refusal_is_atomic_and_duplicates_tick_in_order() {
    let state = ServerState::with_actor("native-owner").unwrap();
    let first = parse(r#"{"id":"shared","body":"first"}"#);
    let second = parse(r#"{"id":"shared","body":"second"}"#);
    let saved = state
        .put_many_owner(&[first.clone(), second.clone()])
        .unwrap();
    assert_eq!(
        saved[0].get("vc").unwrap().get("native-owner"),
        Some(&Value::Number(1.0))
    );
    assert_eq!(
        saved[1].get("vc").unwrap().get("native-owner"),
        Some(&Value::Number(2.0))
    );
    for invalid in [
        "null",
        r#"{"id":""}"#,
        r#"{"id":"shared","vc":{"x":-1}}"#,
        r#"{"id":"shared","vc":{"native-owner":9007199254740991}}"#,
        r#"{"id":"shared","__msSyncDeleted":1,"vc":{"x":1}}"#,
        r#"{"id":"shared","__msSyncStamp":null}"#,
    ] {
        let before = state.query();
        assert!(
            state
                .put_many_owner(&[first.clone(), parse(invalid)])
                .is_err()
        );
        assert_eq!(state.query(), before);
        assert_eq!(owner(&state, "PUT", invalid).status, 400);
        assert_eq!(state.query(), before);
    }
    assert_eq!(
        state
            .put_owner(&first)
            .unwrap()
            .get("vc")
            .unwrap()
            .get("native-owner"),
        Some(&Value::Number(3.0))
    );
    let state = ServerState::with_actor("native-owner").unwrap();
    state
        .apply_remote(&parse(
            r#"{"id":"shared","vc":{"native-owner":9007199254740991}}"#,
        ))
        .unwrap();
    let before = state.query();
    assert_eq!(owner(&state, "DELETE", "").status, 400);
    assert_eq!(state.query(), before);
}

#[test]
fn native_owner_openings_and_private_records_are_independent() {
    assert!(ServerState::with_actor("").is_err());
    let mut actors = std::collections::HashSet::new();
    for _ in 0..16 {
        let state = ServerState::new();
        let saved = state.put_owner(&parse(r#"{"id":"shared"}"#)).unwrap();
        actors.insert(
            saved
                .get("vc")
                .unwrap()
                .as_object()
                .unwrap()
                .keys()
                .next()
                .unwrap()
                .clone(),
        );
    }
    assert_eq!(actors.len(), 16);
    let state = ServerState::new();
    for text in [
        r#"{"id":"secret:key","body":"private"}"#,
        r#"{"id":"meta:schema","version":13}"#,
    ] {
        let value = parse(text);
        assert_eq!(state.put_owner(&value).unwrap(), value);
    }
    assert!(state.sync_records().is_empty());
    assert!(state.delete_owner("secret:key").unwrap());
    assert!(!state.delete_owner("secret:key").unwrap());
    assert!(state.sync_records().is_empty());
}

#[test]
fn native_owner_mutating_handlers_and_email_use_causal_admission() {
    let state = ServerState::new();
    for (method, path, body) in [
        ("PUT", "/api/patterns", r#"{"id":"pattern:a"}"#),
        ("PUT", "/api/graphs", r#"{"id":"graph:a"}"#),
        ("PUT", "/api/replies", r#"{"id":"reply:a"}"#),
        ("PUT", "/api/profile", r#"{"name":"Owner"}"#),
        ("PUT", "/api/resume", r#"{"name":"Owner"}"#),
        (
            "POST",
            "/api/broadcast",
            r#"{"text":"hello","networks":["telegram"]}"#,
        ),
    ] {
        let response = dispatch(&state, method, path, body);
        assert_eq!(response.status, 200, "{path}: {}", response.body_string());
    }
    let response = dispatch(
        &state,
        "POST",
        "/api/email/pull",
        r#"{"messages":[{"id":"one","body":"hi"}]}"#,
    );
    assert_eq!(response.status, 200);
    let pulled = parse(&response.body_string());
    assert_eq!(pulled.get("imported"), Some(&Value::Number(1.0)));
    let response = dispatch(
        &state,
        "POST",
        "/api/email/send",
        r#"{"message":{"to":"a@example.test","text":"hi"}}"#,
    );
    assert_eq!(response.status, 200);
    let sent = parse(&response.body_string());
    assert!(sent.get("queued").unwrap().get("vc").is_some());
    let records = state.sync_records();
    assert_eq!(records.len(), 8);
    assert!(records.iter().all(|v| v.get("vc").is_some()));
}

#[test]
fn native_owner_email_batch_does_not_partially_import_on_error() {
    let state = ServerState::with_actor("native-owner").unwrap();
    state
        .apply_remote(&parse(
            r#"{"id":"msg:email:second","vc":{"native-owner":9007199254740991}}"#,
        ))
        .unwrap();
    let before = state.query();
    let response = dispatch(
        &state,
        "POST",
        "/api/email/pull",
        r#"{"messages":[{"id":"first","body":"new"},{"id":"second","body":"too late"}]}"#,
    );
    assert_eq!(response.status, 400);
    assert!(parse(&response.body_string()).get("error").is_some());
    assert_eq!(state.query(), before);
    assert!(state.get("msg:email:first").is_none());
}

#[test]
fn native_owner_threads_tick_atomically_and_deletions_remain_payload_free() {
    let state = ServerState::with_actor("native-owner").unwrap();
    std::thread::scope(|scope| {
        for body in ["A", "B", "C"] {
            let state = &state;
            scope.spawn(move || {
                state
                    .put_owner(&Value::Object(
                        [
                            ("id".into(), Value::String("shared".into())),
                            ("body".into(), Value::String(body.into())),
                        ]
                        .into(),
                    ))
                    .unwrap()
            });
        }
    });
    let saved = state.get("shared").unwrap();
    assert_eq!(
        saved.get("vc").unwrap().get("native-owner"),
        Some(&Value::Number(3.0))
    );
    assert!(state.delete_owner("shared").unwrap());
    assert!(!state.delete_owner("shared").unwrap());
    assert_eq!(state.len(), 0);
    assert!(state.query().is_empty());
    let deleted = &state.sync_records()[0];
    assert_eq!(deleted.as_object().unwrap().len(), 3);
    assert_eq!(deleted.get("__msSyncDeleted"), Some(&Value::Number(1.0)));
    assert_eq!(
        deleted.get("vc").unwrap().get("native-owner"),
        Some(&Value::Number(5.0))
    );
    state.apply_remote(&saved).unwrap();
    assert!(state.is_empty());
}

#[test]
fn native_owner_matches_production_javascript_assignments() {
    use meta_sovereign_server::record_sync;
    let fixtures = parse(include_str!("fixtures/owner-register.json"));
    for fixture in fixtures.as_array().unwrap() {
        let before = fixture.get("before");
        let original = fixture.clone();
        let actual = if fixture.get("delete") == Some(&Value::Bool(true)) {
            record_sync::deletion("shared", before, "native-owner")
        } else {
            record_sync::assign(fixture.get("value").unwrap(), before, "native-owner")
        }
        .unwrap();
        assert_eq!(
            actual,
            *fixture.get("expected").unwrap(),
            "{:?}",
            fixture.get("name")
        );
        assert_eq!(fixture, &original);
    }
}
