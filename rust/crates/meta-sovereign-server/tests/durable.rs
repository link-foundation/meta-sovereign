#[path = "support/scratch.rs"]
mod scratch;
use meta_sovereign_server::{
    ServerState,
    json::{self, Value},
    wire::Format,
};
use scratch::Scratch;
use std::fs;

fn value(text: &str) -> Value {
    json::parse(text).unwrap()
}
fn current(dir: &Scratch, suffix: &str) -> std::path::PathBuf {
    let number: u64 = fs::read_to_string(dir.0.join("CURRENT"))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    dir.0.join(format!("{number:020}.{suffix}"))
}

#[test]
fn native_durable_reopen_preserves_owner_clocks_deletion_and_private_metadata() {
    let dir = Scratch::new();
    let state = ServerState::open(&dir.0).unwrap();
    let old = value(r#"{"id":"shared","body":"old","vc":{"remote":5}}"#);
    state.apply_remote(&old).unwrap();
    state
        .put_owner(&value(
            r#"{"id":"shared","body":{"saved":[true,null,1.25]},"children":["c"]}"#,
        ))
        .unwrap();
    let secret = value(r#"{"id":"secret:key","body":"private"}"#);
    let schema = value(r#"{"id":"meta:schema","version":13}"#);
    state
        .put_many_owner(&[secret.clone(), schema.clone()])
        .unwrap();
    assert!(state.delete_owner("shared").unwrap());
    let deletion = state.sync_records();
    assert_eq!(deletion.len(), 1);
    assert_eq!(state.get("shared"), None);
    assert!(ServerState::open(&dir.0).is_err());
    drop(state);
    let state = ServerState::open(&dir.0).unwrap();
    assert_eq!(state.sync_records(), deletion);
    assert_eq!(state.get("secret:key"), Some(secret));
    assert_eq!(state.get("meta:schema"), Some(schema));
    state.apply_remote(&old).unwrap();
    assert_eq!(state.get("shared"), None);
    let recreated = state
        .put_owner(&value(r#"{"id":"shared","body":"recreated"}"#))
        .unwrap();
    assert_eq!(state.get("shared"), Some(recreated.clone()));
    // Child links are a grow-only set on replica merge. An older deletion
    // contributes its retained children without replacing the newer payload.
    let mut expected = recreated.as_object().unwrap().clone();
    expected.insert("children".into(), value(r#"["c"]"#));
    let expected = Value::Object(expected);
    state.apply_remote(&deletion[0]).unwrap();
    assert_eq!(state.get("shared"), Some(expected.clone()));
    assert_eq!(recreated.get("vc").unwrap().as_object().unwrap().len(), 3);
    drop(state);
    assert_eq!(
        ServerState::open(&dir.0).unwrap().get("shared"),
        Some(expected)
    );
}

#[test]
fn native_durable_recovers_one_bad_copy_and_refuses_ambiguous_or_unknown_schema() {
    let dir = Scratch::new();
    let state = ServerState::open(&dir.0).unwrap();
    let saved = state
        .put_owner(&value(r#"{"id":"saved","body":"original"}"#))
        .unwrap();
    drop(state);
    fs::write(current(&dir, "lino"), "(").unwrap();
    let state = ServerState::open(&dir.0).unwrap();
    assert_eq!(state.get("saved"), Some(saved.clone()));
    drop(state);
    fs::write(current(&dir, "bin"), [0xff]).unwrap();
    let state = ServerState::open(&dir.0).unwrap();
    assert_eq!(state.get("saved"), Some(saved));
    drop(state);
    let path = current(&dir, "lino");
    let original = Format::Text.decode(&fs::read(&path).unwrap()).unwrap();
    let mut changed = original.as_object().unwrap().clone();
    changed.insert("records".into(), Value::Array(vec![]));
    fs::write(
        &path,
        Format::Text
            .encode(&Value::Object(changed.clone()))
            .unwrap(),
    )
    .unwrap();
    assert!(ServerState::open(&dir.0).is_err(), "valid copies disagree");
    changed.insert("schema".into(), Value::Number(14.0));
    fs::write(&path, Format::Text.encode(&Value::Object(changed)).unwrap()).unwrap();
    assert!(
        ServerState::open(&dir.0).is_err(),
        "never downgrade a future schema using its other copy"
    );
    fs::write(&path, b"(").unwrap();
    fs::write(current(&dir, "bin"), [0xff]).unwrap();
    assert!(
        ServerState::open(&dir.0).is_err(),
        "never replace two corrupt copies with empty state"
    );
}

#[test]
fn native_durable_failed_batch_leaves_disk_and_memory_at_prior_commit() {
    let dir = Scratch::new();
    let state = ServerState::open(&dir.0).unwrap();
    let before = state.put_owner(&value(r#"{"id":"original"}"#)).unwrap();
    let pointer = fs::read(dir.0.join("CURRENT")).unwrap();
    let blocked = dir.0.join("00000000000000000002.bin");
    fs::create_dir(&blocked).unwrap();
    let error = state
        .put_many_owner(&[
            value(r#"{"id":"original","body":"new"}"#),
            value(r#"{"id":"second"}"#),
        ])
        .unwrap_err();
    assert_eq!(error.status(), 503);
    assert_eq!(state.query(), vec![before.clone()]);
    assert_eq!(fs::read(dir.0.join("CURRENT")).unwrap(), pointer);
    fs::remove_dir(blocked).unwrap();
    drop(state);
    assert_eq!(ServerState::open(&dir.0).unwrap().query(), vec![before]);
}
