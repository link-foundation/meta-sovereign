//! Golden values produced by the actual production JavaScript wire codecs.
use meta_sovereign_server::json::{self, Value};
use meta_sovereign_server::wire::{Format, MAX_DEPTH};

fn unhex(hex: &str) -> Vec<u8> {
    hex.as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}

#[test]
fn javascript_text_binary_line_and_compact_vectors_decode_exactly() {
    let vectors = json::parse(include_str!("fixtures/lino-wire.json")).unwrap();
    for vector in vectors.as_array().unwrap() {
        let expected = vector.get("value").unwrap();
        for record in vector.get("records").unwrap().as_array().unwrap() {
            let format =
                Format::from_media(record.get("type").unwrap().as_str().unwrap(), false).unwrap();
            let decoded = format
                .decode(&unhex(record.get("hex").unwrap().as_str().unwrap()))
                .unwrap();
            assert_eq!(&decoded, expected, "{format:?}");
            assert_eq!(
                &format.decode(&format.encode(expected).unwrap()).unwrap(),
                expected,
                "native {format:?}"
            );
        }
    }
}

#[test]
fn explicit_media_and_bounded_malformed_values() {
    // The upstream single-line reader handles readable values only; typed
    // compact auto-detection belongs to the default text reader.
    assert_eq!(
        Format::Line.decode(b"(int 12)").unwrap(),
        Value::Array(vec![Value::String("int".into()), Value::Number(12.0)])
    );
    assert!(Format::from_media("application/json", false).is_err());
    assert_eq!(
        Format::from_media("application/json", true).unwrap(),
        Format::Json
    );
    assert!(Format::from_media("", false).is_err());
    assert!(Format::Text.decode(b"{\"not\":\"lino\"}").is_err());
    assert!(Format::Text.decode(&[0xff]).is_err());
    assert!(Format::Text.decode(b"(escaped \"%FF\")").is_err());
    assert!(Format::Line.decode(b"(\n)").is_err());
    assert!(Format::Binary.decode(b"not a binary packet").is_err());
    let nested = format!(
        "{}0{}",
        "(".repeat(MAX_DEPTH + 2),
        ")".repeat(MAX_DEPTH + 2)
    );
    assert!(Format::Text.decode(nested.as_bytes()).is_err());
    assert!(Format::Compact.decode(nested.as_bytes()).is_err());
    let nested_json = format!(
        "{}0{}",
        "[".repeat(MAX_DEPTH + 2),
        "]".repeat(MAX_DEPTH + 2)
    );
    assert!(Format::Json.decode(nested_json.as_bytes()).is_err());
    let object = Value::Object(Default::default());
    assert_eq!(
        Format::Text
            .decode(&Format::Text.encode(&object).unwrap())
            .unwrap(),
        object
    );
}
