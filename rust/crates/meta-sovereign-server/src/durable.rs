//! Rich native checkpoints use the same official text/binary wire codecs.
use std::collections::BTreeSet;
use std::io;
use std::path::Path;

use crate::checkpoint::Checkpoint;
use crate::json::Value;
use crate::record_sync;
use crate::state::{ServerState, StateError, StatePersistence};
use crate::wire::{Format, MAX_BYTES};

struct DurableState(Checkpoint);

fn invalid(message: impl ToString) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.to_string())
}

fn envelope(records: Vec<Value>) -> Value {
    Value::Object(
        [
            ("format".into(), Value::Number(1.0)),
            ("schema".into(), Value::Number(13.0)),
            ("records".into(), Value::Array(records)),
        ]
        .into(),
    )
}

fn decode(format: Format, bytes: io::Result<Option<Vec<u8>>>) -> io::Result<Option<Vec<Value>>> {
    let Some(bytes) = bytes? else { return Ok(None) };
    let value = format.decode(&bytes).map_err(invalid)?;
    if value.get("format") != Some(&Value::Number(1.0))
        || value.get("schema") != Some(&Value::Number(13.0))
    {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "unsupported native checkpoint schema",
        ));
    }
    let records = value
        .get("records")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("native checkpoint records must be an array"))?;
    let mut ids = BTreeSet::new();
    for record in records {
        let core = record_sync::core_link(record).map_err(invalid)?;
        if !ids.insert(core.id) {
            return Err(invalid("duplicate native checkpoint record"));
        }
    }
    Ok(Some(records.clone()))
}

impl StatePersistence for DurableState {
    fn commit(&mut self, records: Vec<&Value>) -> io::Result<()> {
        let value = envelope(records.into_iter().cloned().collect());
        let text = Format::Text.encode(&value).map_err(invalid)?;
        let binary = Format::Binary.encode(&value).map_err(invalid)?;
        self.0.commit(&text, &binary)
    }
}

impl ServerState {
    /// Own a native-only directory. Never open a JavaScript database as a
    /// native checkpoint or admit another writer to the same directory.
    pub fn open(directory: impl AsRef<Path>) -> Result<Self, StateError> {
        let checkpoint = Checkpoint::open(directory.as_ref())?;
        let text = decode(Format::Text, checkpoint.read("lino", MAX_BYTES));
        let binary = decode(Format::Binary, checkpoint.read("bin", MAX_BYTES));
        let (records, repair) = match (text, binary) {
            (Err(error), _) | (_, Err(error)) if error.kind() == io::ErrorKind::Unsupported => {
                return Err(error.into());
            }
            (Ok(None), Ok(None)) => (Vec::new(), true),
            (Ok(Some(left)), Ok(Some(right))) if left == right => (left, false),
            (Ok(Some(_)), Ok(Some(_))) => {
                return Err(invalid(
                    "native checkpoint copies disagree; preserve files for recovery",
                )
                .into());
            }
            (Ok(Some(records)), Err(_)) | (Err(_), Ok(Some(records))) => (records, true),
            _ => {
                return Err(invalid(
                    "no valid current native checkpoint; preserve files for recovery",
                )
                .into());
            }
        };
        let mut persistence = DurableState(checkpoint);
        if repair {
            persistence.commit(records.iter().collect())?;
            if std::env::var("MS_NATIVE_STORAGE_DEBUG").as_deref() == Ok("1") {
                eprintln!(
                    "[native-storage] initialized or repaired text/binary checkpoint; records={}",
                    records.len()
                );
            }
        }
        Self::with_persistence(records, Box::new(persistence))
    }
}
