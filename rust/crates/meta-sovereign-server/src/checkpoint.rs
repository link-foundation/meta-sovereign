//! Publish an immutable text/binary pair through one durable commit pointer.
//! Codec validation belongs to the caller. Unpublished generations are never read.
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

pub(crate) struct Checkpoint {
    root: PathBuf,
    _lock: File,
    generation: Option<u64>,
    uncertain: bool,
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn read_bounded(path: &Path, limit: usize) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(invalid("native checkpoint exceeds its byte limit"));
    }
    Ok(bytes)
}

fn write_new(path: &Path, bytes: &[u8], created: &mut Vec<PathBuf>) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    created.push(path.into());
    file.write_all(bytes)?;
    file.sync_all()
}

fn sync_directory(root: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        File::open(root)?.sync_all()?;
    }
    #[cfg(not(unix))]
    let _ = root;
    Ok(())
}

impl Checkpoint {
    pub(crate) fn open(root: &Path) -> io::Result<Self> {
        let absolute = if root.is_absolute() {
            root.to_path_buf()
        } else {
            std::env::current_dir()?.join(root)
        };
        let root = absolute.as_path();
        let mut missing = Vec::new();
        for path in root.ancestors() {
            if path.try_exists()? {
                break;
            }
            missing.push(path);
        }
        let mut directory = fs::DirBuilder::new();
        directory.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            directory.mode(0o700);
        }
        directory.create(root)?;
        // Persist newly created directory entries too, including the default
        // nested root. Flushing only files and the leaf directory is not enough.
        for path in missing {
            if let Some(parent) = path.parent() {
                sync_directory(parent)?;
            }
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock = options.open(root.join("owner.lock"))?;
        lock.try_lock().map_err(io::Error::other)?;
        let generation = match read_bounded(&root.join("CURRENT"), 32) {
            Ok(bytes) => Some(
                std::str::from_utf8(&bytes)
                    .ok()
                    .map(|value| value.trim_end_matches('\n'))
                    .filter(|value| !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()))
                    .and_then(|value| value.parse::<u64>().ok())
                    .ok_or_else(|| invalid("invalid native checkpoint pointer"))?,
            ),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                // Never silently turn an existing store into an empty store.
                for entry in fs::read_dir(root)? {
                    if entry?.file_name() != "owner.lock" {
                        return Err(invalid(
                            "native checkpoint pointer is missing; preserve files for recovery",
                        ));
                    }
                }
                None
            }
            Err(error) => return Err(error),
        };
        let checkpoint = Self {
            root: root.into(),
            _lock: lock,
            generation,
            uncertain: false,
        };
        // A crashed writer may leave its unpublished next generation. Only
        // known files beyond CURRENT can be removed; keep the committed pair.
        if let Some(current) = generation {
            for entry in fs::read_dir(root)? {
                let entry = entry?;
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name == "CURRENT.next"
                    || name.split_once('.').is_some_and(|(number, suffix)| {
                        number.len() == 20
                            && number.bytes().all(|b| b.is_ascii_digit())
                            && matches!(suffix, "lino" | "bin")
                            && number.parse::<u64>().is_ok_and(|number| number > current)
                    })
                {
                    fs::remove_file(entry.path())?;
                }
            }
        }
        Ok(checkpoint)
    }

    fn path(&self, generation: u64, suffix: &str) -> PathBuf {
        self.root.join(format!("{generation:020}.{suffix}"))
    }

    pub(crate) fn read(&self, suffix: &str, limit: usize) -> io::Result<Option<Vec<u8>>> {
        self.generation
            .map(|generation| read_bounded(&self.path(generation, suffix), limit))
            .transpose()
    }

    pub(crate) fn commit(&mut self, text: &[u8], binary: &[u8]) -> io::Result<()> {
        self.commit_synced(text, binary, sync_directory)
    }

    pub(crate) fn commit_synced(
        &mut self,
        text: &[u8],
        binary: &[u8],
        mut sync: impl FnMut(&Path) -> io::Result<()>,
    ) -> io::Result<()> {
        if self.uncertain {
            return Err(io::Error::other(
                "native checkpoint outcome is uncertain; reopen before writing",
            ));
        }
        let next = self
            .generation
            .map_or(Some(0), |n| n.checked_add(1))
            .ok_or_else(|| invalid("native checkpoint generation exhausted"))?;
        let text_path = self.path(next, "lino");
        let binary_path = self.path(next, "bin");
        let pointer = self.root.join("CURRENT.next");
        let mut created = Vec::new();
        let staged = (|| {
            write_new(&text_path, text, &mut created)?;
            write_new(&binary_path, binary, &mut created)?;
            sync(&self.root)?;
            write_new(&pointer, format!("{next}\n").as_bytes(), &mut created)?;
            fs::rename(&pointer, self.root.join("CURRENT"))
        })();
        if let Err(error) = staged {
            for path in created {
                let _ = fs::remove_file(path);
            }
            return Err(error);
        }
        self.uncertain = true;
        // A failure after pointer replacement may already be durable. Refuse
        // subsequent writes rather than overwrite it using stale memory.
        sync(&self.root)?;
        let previous = self.generation.replace(next);
        self.uncertain = false;
        // Retain the current and previous committed pair as recovery dumps.
        if let Some(old) = previous.and_then(|n| n.checked_sub(1)) {
            for suffix in ["lino", "bin"] {
                let _ = fs::remove_file(self.path(old, suffix));
            }
        }
        Ok(())
    }
}
