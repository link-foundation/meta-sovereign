//! The HTTP boundary owns wire encoding; existing handlers keep their value model.
use super::{Format, Result};
use crate::http::{Request, Response};
use crate::json::{self, Value};

pub(crate) fn select(accept: Option<&str>, compatibility: bool) -> Option<Format> {
    let accept = accept.filter(|s| !s.trim().is_empty()).unwrap_or("*/*");
    let formats = if compatibility {
        vec![
            Format::Json,
            Format::Text,
            Format::Binary,
            Format::Line,
            Format::Compact,
        ]
    } else {
        vec![Format::Text, Format::Binary, Format::Line, Format::Compact]
    };
    let mut chosen = None;
    let mut best = 0.0;
    for format in formats {
        let mut specificity = -1;
        let mut quality: f64 = 0.0;
        for range in accept.split(',') {
            let mut parts = range.split(';');
            let media = parts.next().unwrap_or("").trim().to_ascii_lowercase();
            let rank = if media == format.media() {
                2
            } else if media == "*/*" {
                0
            } else if media.ends_with("/*") && format.media().starts_with(&media[..media.len() - 1])
            {
                1
            } else {
                continue;
            };
            let q = parts
                .find_map(|part| {
                    let (key, value) = part.trim().split_once('=')?;
                    key.eq_ignore_ascii_case("q")
                        .then(|| value.parse::<f64>().unwrap_or(0.0))
                })
                .unwrap_or(1.0);
            let q = if q.is_finite() {
                q.clamp(0.0, 1.0)
            } else {
                0.0
            };
            if rank > specificity {
                specificity = rank;
                quality = q;
            } else if rank == specificity {
                quality = quality.max(q);
            }
        }
        if quality > best {
            chosen = Some(format);
            best = quality;
        }
    }
    chosen
}

pub(crate) fn decode_request(req: &mut Request, compatibility: bool) -> Result<()> {
    if req.body.is_empty() {
        return Ok(());
    }
    let default = if compatibility {
        Format::Json
    } else {
        Format::Text
    };
    let format = Format::from_media(
        req.headers
            .get("content-type")
            .map(String::as_str)
            .unwrap_or(default.media()),
        compatibility,
    )?;
    let value = format.decode(&req.body)?;
    // This serialization is an internal handler bridge, never a wire payload.
    req.body = json::encode(&value).into_bytes();
    Ok(())
}

pub(crate) fn error(status: u16, code: &str, message: &str) -> Response {
    let value = Value::Object(
        [
            ("ok".into(), Value::Bool(false)),
            ("code".into(), Value::String(code.into())),
            ("error".into(), Value::String(message.into())),
        ]
        .into(),
    );
    Response::json(status, &json::encode(&value))
}

pub(crate) fn encode_response(mut response: Response, format: Format) -> Response {
    if response.headers.iter().any(|(key, value)| {
        key.eq_ignore_ascii_case("content-type") && value.starts_with("application/json")
    }) {
        let encoded = Format::Json
            .decode(&response.body)
            .and_then(|value| format.encode(&value));
        match encoded {
            Ok(body) => response.body = body,
            Err(_) => {
                response = error(500, "wire-encoding-failed", "response could not be encoded");
                let value = json::parse(std::str::from_utf8(&response.body).unwrap()).unwrap();
                response.body = format.encode(&value).expect("bounded error value");
            }
        }
        for (key, value) in &mut response.headers {
            if key.eq_ignore_ascii_case("content-type") {
                *value = format.media().into();
            }
        }
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn handler_response_depth_is_bounded_before_recursive_parsing() {
        let nested = format!("{}0{}", "[".repeat(66), "]".repeat(66));
        let response = encode_response(Response::json(200, &nested), Format::Text);
        assert_eq!(response.status, 500);
        assert_eq!(
            Format::Text
                .decode(&response.body)
                .unwrap()
                .get("code")
                .unwrap()
                .as_str(),
            Some("wire-encoding-failed")
        );
    }
    #[test]
    fn specificity_and_explicit_compatibility() {
        assert_eq!(select(None, false), Some(Format::Text));
        assert_eq!(select(None, true), Some(Format::Json));
        assert_eq!(select(Some("application/json"), false), None);
        assert_eq!(
            select(Some("text/lino;q=0, */*;q=0.5"), false),
            Some(Format::Binary)
        );
        assert_eq!(
            select(Some("text/*;q=0, application/lino-binary;q=0"), false),
            None
        );
        assert_eq!(
            select(
                Some("text/lino;q=0.1, application/lino-binary;q=0.8"),
                false
            ),
            Some(Format::Binary)
        );
    }
}
