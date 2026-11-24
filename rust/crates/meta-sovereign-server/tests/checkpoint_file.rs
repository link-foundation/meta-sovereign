#[path = "../src/checkpoint.rs"]
mod checkpoint;
#[path = "support/scratch.rs"]
mod scratch;
use checkpoint::Checkpoint;
use scratch::Scratch;
use std::fs;
use std::io;

#[test]
fn checkpoint_nested_root_is_created_with_private_files() {
    let directory = Scratch::new();
    let root = directory.0.join("nested/checkpoints");
    let mut checkpoint = Checkpoint::open(&root).unwrap();
    checkpoint.commit(b"new-root", b"new-binary").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&root).unwrap().permissions().mode() & 0o777,
            0o700
        );
        for name in [
            "owner.lock",
            "CURRENT",
            "00000000000000000000.bin",
            "00000000000000000000.lino",
        ] {
            assert_eq!(
                fs::metadata(root.join(name)).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    assert_eq!(
        checkpoint.read("lino", 32).unwrap(),
        Some(b"new-root".to_vec())
    );
}

#[test]
fn checkpoint_uncertain_publish_refuses_further_writes_until_reopen() {
    let directory = Scratch::new();
    let mut checkpoint = Checkpoint::open(&directory.0).unwrap();
    checkpoint.commit(b"old-text", b"old-binary").unwrap();
    let mut count = 0;
    let error = checkpoint.commit_synced(b"new-text", b"new-binary", |_| {
        count += 1;
        if count == 2 {
            Err(io::Error::other("injected directory sync failure"))
        } else {
            Ok(())
        }
    });
    assert!(error.is_err());
    assert!(checkpoint.commit(b"stale", b"stale").is_err());
    drop(checkpoint);
    let checkpoint = Checkpoint::open(&directory.0).unwrap();
    assert_eq!(
        checkpoint.read("lino", 32).unwrap(),
        Some(b"new-text".to_vec())
    );
    assert_eq!(
        checkpoint.read("bin", 32).unwrap(),
        Some(b"new-binary".to_vec())
    );
}

#[test]
fn checkpoint_pairs_publish_atomically_and_keep_one_previous_generation() {
    let dir = Scratch::new();
    let mut disk = Checkpoint::open(&dir.0).unwrap();
    assert!(
        Checkpoint::open(&dir.0).is_err(),
        "another writer must be refused"
    );
    for index in 0..4 {
        disk.commit(format!("text-{index}").as_bytes(), &[index])
            .unwrap();
    }
    assert_eq!(disk.read("lino", 32).unwrap(), Some(b"text-3".to_vec()));
    assert_eq!(disk.read("bin", 32).unwrap(), Some(vec![3]));
    assert!(disk.read("lino", 2).is_err());
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 6);
    assert!(dir.0.join("00000000000000000002.lino").is_file());
    drop(disk);
    let mut disk = Checkpoint::open(&dir.0).unwrap();
    disk.commit(b"after-reopen", &[4]).unwrap();
    assert_eq!(disk.read("bin", 32).unwrap(), Some(vec![4]));
}

#[test]
fn checkpoint_failed_pair_never_advances_pointer_and_orphans_are_ignored() {
    let dir = Scratch::new();
    let mut disk = Checkpoint::open(&dir.0).unwrap();
    disk.commit(b"committed", &[7]).unwrap();
    let blocked = dir.0.join("00000000000000000001.bin");
    fs::create_dir(&blocked).unwrap();
    assert!(disk.commit(b"unpublished", &[8]).is_err());
    assert_eq!(fs::read(dir.0.join("CURRENT")).unwrap(), b"0\n");
    assert_eq!(disk.read("lino", 32).unwrap(), Some(b"committed".to_vec()));
    fs::remove_dir(blocked).unwrap();
    fs::write(dir.0.join("00000000000000000001.lino"), "orphan").unwrap();
    fs::write(dir.0.join("CURRENT.next"), "1\n").unwrap();
    let unrelated = dir.0.join("+0000000000000000001.lino");
    fs::write(&unrelated, "preserve noncanonical file").unwrap();
    drop(disk);
    let mut disk = Checkpoint::open(&dir.0).unwrap();
    assert!(!dir.0.join("CURRENT.next").exists());
    assert_eq!(
        fs::read_to_string(unrelated).unwrap(),
        "preserve noncanonical file"
    );
    assert_eq!(disk.read("bin", 32).unwrap(), Some(vec![7]));
    disk.commit(b"replacement", &[9]).unwrap();
}

#[test]
fn checkpoint_missing_corrupt_or_exhausted_pointer_refuses_silent_reset() {
    let dir = Scratch::new();
    fs::write(dir.0.join("unrecognized-database"), "preserve this").unwrap();
    assert!(Checkpoint::open(&dir.0).is_err());
    fs::remove_file(dir.0.join("unrecognized-database")).unwrap();
    for content in ["../outside", "\n", "18446744073709551616", "1\n2", "+1"] {
        fs::write(dir.0.join("CURRENT"), content).unwrap();
        assert!(Checkpoint::open(&dir.0).is_err(), "{content}");
    }
    fs::write(dir.0.join("CURRENT"), u64::MAX.to_string()).unwrap();
    let mut disk = Checkpoint::open(&dir.0).unwrap();
    assert!(disk.commit(b"full", &[1]).is_err());
}

#[test]
fn checkpoint_staging_refusal_preserves_preexisting_files() {
    let dir = Scratch::new();
    let mut disk = Checkpoint::open(&dir.0).unwrap();
    disk.commit(b"committed", &[7]).unwrap();
    let blocked = dir.0.join("00000000000000000001.bin");
    fs::write(&blocked, "preexisting").unwrap();
    assert!(disk.commit(b"unpublished", &[8]).is_err());
    assert_eq!(fs::read(&blocked).unwrap(), b"preexisting");
    assert!(!dir.0.join("00000000000000000001.lino").exists());
    assert_eq!(disk.read("bin", 32).unwrap(), Some(vec![7]));
    fs::remove_file(blocked).unwrap();
    assert!(
        disk.commit_synced(b"failed-sync", &[9], |_| Err(io::Error::other(
            "injected staging failure"
        )))
        .is_err()
    );
    assert_eq!(fs::read(dir.0.join("CURRENT")).unwrap(), b"0\n");
    disk.commit(b"retry", &[10]).unwrap();
}
