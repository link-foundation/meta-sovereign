use meta_sovereign_core::SyncError;
use meta_sovereign_server::{
    ServerState,
    json::{self, Value},
    record_sync::merge,
};

fn parse(text: &str) -> Value {
    json::parse(text).unwrap()
}

#[test]
fn native_rich_reference_permutations() {
    let fixtures = parse(include_str!("fixtures/rich-register.json"));
    for fixture in fixtures.as_array().unwrap() {
        let records = fixture.get("records").unwrap().as_array().unwrap();
        let expected = fixture.get("expected").unwrap();
        let original = records.clone();
        for [a, b, c] in [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ] {
            let left = merge(&merge(&records[a], &records[b]).unwrap(), &records[c]).unwrap();
            let right = merge(&records[a], &merge(&records[b], &records[c]).unwrap()).unwrap();
            assert_eq!(&left, expected, "{:?}", fixture.get("name"));
            assert_eq!(&right, expected, "{:?}", fixture.get("name"));
            assert_eq!(merge(&left, &records[a]).unwrap(), *expected);
            assert_eq!(merge(expected, expected).unwrap(), *expected);
        }
        assert_eq!(records, &original);
    }
}

#[test]
fn native_rich_rejects_invalid_records_in_both_orders() {
    let valid = parse(r#"{"id":"shared","body":"owner","vc":{"a":1}}"#);
    let invalid = [
        "null",
        "[]",
        "{}",
        r#"{"id":1}"#,
        r#"{"id":"other"}"#,
        r#"{"id":"shared","children":[1]}"#,
        r#"{"id":"shared","vc":[]}"#,
        r#"{"id":"shared","vc":{"a":-1}}"#,
        r#"{"id":"shared","vc":{"a":0.5}}"#,
        r#"{"id":"shared","vc":{"a":9007199254740992}}"#,
        r#"{"id":"shared","vc":{"a":"1"}}"#,
        r#"{"id":"shared","__msSyncStamp":null}"#,
        r#"{"id":"shared","vc":{},"__msSyncStamp":{"version":2}}"#,
        r#"{"id":"shared","vc":{"a":1},"__msSyncStamp":{"version":1,"clock":{"a":2},"context":{"a":1}}}"#,
        r#"{"id":"shared","vc":{"a":1},"__msSyncStamp":{"version":1,"clock":{},"context":{"b":1}}}"#,
        r#"{"id":"shared","__msSyncDeleted":true,"vc":{"a":1}}"#,
        r#"{"id":"shared","__msSyncDeleted":1,"vc":{}}"#,
        r#"{"id":"shared","__msSyncDeleted":1,"vc":{"a":1},"body":"erased"}"#,
    ];
    for text in invalid {
        let bad = parse(text);
        let copy = bad.clone();
        assert!(merge(&valid, &bad).is_err(), "{text}");
        assert!(merge(&bad, &valid).is_err(), "{text}");
        assert_eq!(bad, copy);
    }
    for number in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut bad = valid.as_object().unwrap().clone();
        bad.insert("body".into(), Value::Number(number));
        assert_eq!(
            merge(&Value::Object(bad), &valid),
            Err(SyncError::InvalidValue)
        );
    }
    let mut deep = Value::Null;
    for _ in 0..65 {
        deep = Value::Array(vec![deep]);
    }
    let mut bad = valid.as_object().unwrap().clone();
    bad.insert("body".into(), deep);
    assert_eq!(
        merge(&valid, &Value::Object(bad)),
        Err(SyncError::InvalidValue)
    );
}

#[test]
fn native_rich_remote_admission_keeps_deletions_and_private_records() {
    let state = ServerState::new();
    let old = parse(r#"{"id":"shared","body":"old","vc":{"a":1}}"#);
    let deleted = parse(r#"{"id":"shared","__msSyncDeleted":1,"vc":{"a":2}}"#);
    let new = parse(r#"{"id":"shared","body":"new","vc":{"a":3}}"#);
    state.put(parse(r#"{"id":"secret:key","body":"private"}"#));
    state.put(parse(r#"{"id":"meta:schema","version":13}"#));
    state.apply_remote(&old).unwrap();
    state.apply_remote(&deleted).unwrap();
    state.apply_remote(&old).unwrap();
    assert_eq!(state.get("shared"), None);
    assert_eq!(state.query().len(), 2);
    assert_eq!(state.len(), 2);
    assert_eq!(state.sync_records(), [deleted]);
    let before = state.query();
    for invalid in [
        r#"{"id":"secret:key","body":"attacker","vc":{"a":9}}"#,
        r#"{"id":"meta:schema","version":999,"vc":{"a":9}}"#,
        r#"{"id":"shared","body":"invalid","vc":{"a":-1}}"#,
        r#"{"id":""}"#,
    ] {
        assert!(state.apply_remote(&parse(invalid)).is_err());
    }
    assert_eq!(state.query(), before);
    assert_eq!(state.apply_remote(&new).unwrap(), new);
    assert_eq!(state.get("shared"), Some(new));
    assert_eq!(state.len(), 3);
    assert!(!state.is_empty());
}

#[test]
fn native_rich_concurrent_admission_converges() {
    let state = std::sync::Arc::new(ServerState::new());
    let records = [
        parse(r#"{"id":"shared","body":"A","vc":{"a":2}}"#),
        parse(r#"{"id":"shared","body":"B","vc":{"b":1}}"#),
        parse(r#"{"id":"shared","body":"C","vc":{"a":1,"b":1}}"#),
    ];
    let expected = merge(&merge(&records[0], &records[1]).unwrap(), &records[2]).unwrap();
    let gate = std::sync::Arc::new(std::sync::Barrier::new(3));
    let threads: Vec<_> = records
        .into_iter()
        .map(|record| {
            let state = state.clone();
            let gate = gate.clone();
            std::thread::spawn(move || {
                gate.wait();
                state.apply_remote(&record).unwrap();
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    assert_eq!(state.get("shared"), Some(expected));
}
