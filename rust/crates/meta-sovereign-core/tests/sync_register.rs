use meta_sovereign_core::{Link, merge, vc_merge};

fn record(body: &str, clock: &[(&str, u64)]) -> Link {
    let mut link = Link::new("shared", [body]);
    link.vc = clock.iter().map(|(k, n)| ((*k).to_owned(), *n)).collect();
    link
}

#[test]
fn sync_parent_equal_clocks_are_commutative() {
    let a = record("A", &[("a", 1)]);
    let b = record("Z", &[("a", 1)]);
    assert_eq!(merge(&a, &b), merge(&b, &a));
}

#[test]
fn sync_parent_joined_observations_do_not_promote_a_payload() {
    let a = record("A", &[("a", 2)]);
    let b = record("B", &[("b", 1)]);
    let c = record("C", &[("a", 1), ("b", 1)]);
    assert_eq!(merge(&merge(&a, &b), &c), merge(&a, &merge(&b, &c)));
    assert_eq!(merge(&merge(&a, &b), &c).tokens, ["A"]);
}

#[test]
fn sync_parent_children_are_a_canonical_set() {
    let mut a = record("A", &[]);
    a.children = ["z", "a", "z"].map(String::from).to_vec();
    let mut b = record("B", &[]);
    b.children = ["b", "a"].map(String::from).to_vec();
    for _ in 0..4 {
        assert_eq!(merge(&a, &b).children, ["a", "b", "z"]);
        assert_eq!(merge(&b, &a).children, ["a", "b", "z"]);
    }
}

#[test]
fn sync_parent_zero_counters_are_absent() {
    let a = record("A", &[("a", 0)]);
    let b = record("B", &[("b", 2)]);
    assert_eq!(vc_merge(&a.vc, &b.vc), b.vc);
}

// Checked metadata regressions. The finite parent probe compiles the preceding
// unchanged-API cases against the exact published library, without new types.
use meta_sovereign_core::{
    AssignmentStamp, SyncError, try_merge, try_vc_compare, try_vc_merge, try_vc_tick,
};

#[test]
fn sync_observed_tick_starts_a_new_assignment() {
    let a = record("A", &[("a", 2)]);
    let b = record("B", &[("b", 1)]);
    let joined = merge(&a, &b);
    assert_eq!(joined.sync_stamp.as_ref().unwrap().clock, a.vc);
    let mut edited = joined.clone();
    edited.tokens = vec!["owner edit".into()];
    edited.vc = try_vc_tick(&edited.vc, "a").unwrap();
    let next = try_merge(&edited, &joined).unwrap();
    assert_eq!(next.tokens, ["owner edit"]);
    assert_eq!(next.sync_stamp, None);
    assert_eq!(merge(&next, &a), next);
    assert_eq!(merge(&b, &next), next);
    assert_eq!(joined.sync_stamp.as_ref().unwrap().context, joined.vc);
}

#[test]
fn sync_rejects_invalid_stamps_and_different_ids() {
    let a = record("A", &[("a", 2)]);
    let mut b = a.clone();
    b.id = "other".into();
    assert_eq!(try_merge(&a, &b), Err(SyncError::InvalidValue));
    for (clock, context) in [
        (vec![("a", 3)], vec![("a", 2)]),
        (vec![("a", 1)], vec![("a", 3)]),
        (vec![("b", 1)], vec![("b", 1)]),
    ] {
        let mut invalid = a.clone();
        invalid.sync_stamp = Some(AssignmentStamp {
            clock: clock.into_iter().map(|(k, n)| (k.into(), n)).collect(),
            context: context.into_iter().map(|(k, n)| (k.into(), n)).collect(),
        });
        assert_eq!(try_merge(&invalid, &a), Err(SyncError::InvalidValue));
    }
}

#[test]
fn sync_clock_limits_and_actor_names_match_javascript() {
    let max = 9_007_199_254_740_991;
    let exhausted = record("A", &[("a", max)]);
    let invalid = record("B", &[("a", max + 1)]);
    assert_eq!(
        try_vc_tick(&exhausted.vc, "a"),
        Err(SyncError::InvalidClock)
    );
    assert_eq!(try_vc_tick(&exhausted.vc, ""), Err(SyncError::InvalidClock));
    assert_eq!(
        try_vc_merge(&invalid.vc, &exhausted.vc),
        Err(SyncError::InvalidClock)
    );
    assert_eq!(
        try_vc_compare(&exhausted.vc, &invalid.vc),
        Err(SyncError::InvalidClock)
    );
    let actors = record("C", &[("__proto__", 1), ("constructor", 2)]);
    assert_eq!(
        try_vc_tick(&actors.vc, "__proto__").unwrap()["__proto__"],
        2
    );
    assert_eq!(
        try_vc_compare(&record("D", &[("a", 0)]).vc, &record("E", &[]).vc),
        Ok(Some(std::cmp::Ordering::Equal))
    );
}

#[test]
fn sync_decimal_versions_do_not_overflow_or_sort_by_width() {
    let mut a = record("old", &[]);
    let mut b = record("new", &[]);
    a.version = Some("9-z".into());
    b.version = Some("10-a".into());
    assert_eq!(merge(&a, &b).tokens, ["new"]);
    a.version = Some("9999999999999999999999999999999999999999999-a".into());
    assert_eq!(merge(&a, &b).tokens, ["old"]);
}
