//! Email source surface for the Rust server.
//!
//! Mirrors the wire shape of the JS server's `/api/email/pull` and
//! `/api/email/send` routes (`js/src/server/routes-mutating.js`) so the
//! SPA, CLI, and external callers can drive either backend with one
//! request shape.
//!
//! The Rust server does not ship an outbound HTTP client or raw IMAP /
//! POP3 / SMTP transport, so it covers two practical paths:
//!
//! 1. **Archive ingest** — callers POST a `messages` / `archive` /
//!    `value` / `list` / `emails` / `items` array (same envelope keys
//!    `parseEmailArchive` accepts in JS) and the server normalizes the
//!    records into stamped `msg:email:*` links and stores them, exactly
//!    like the JS pull path.
//! 2. **Send queueing** — `/api/email/send` accepts the same `message`
//!    body the JS server consumes, but enqueues a `email-send:*` link
//!    rather than calling out to Gmail / Microsoft Graph / JMAP. The
//!    response carries `result.status: "queued"` and the caller is
//!    expected to drain the queue with the JS server (which holds the
//!    fetch + raw-protocol fallback). This keeps every email route in
//!    parity at the wire level while making it explicit when delivery
//!    needs the JS backend.
//!
//! This is the same pragmatic split documented in
//! `docs/SERVER-PARITY.md` for hardening / encrypted-export endpoints.

use crate::handlers::url_decode;
use crate::http::Request;
use crate::json::{self, Value};
use crate::state::ServerState;

const SOURCE: &str = "email";
const ARCHIVE_KEYS: &[&str] = &["messages", "value", "list", "emails", "items", "archive"];
const RAW_PROTOCOLS: &[&str] = &["imap", "pop3", "smtp"];

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn body_value<'a>(body: &'a Value, key: &str, aliases: &[&str]) -> Option<&'a Value> {
    let cfg = body.get("config");
    for name in std::iter::once(&key).chain(aliases.iter()) {
        if let Some(v) = body.get(name) {
            return Some(v);
        }
        if let Some(c) = cfg {
            if let Some(v) = c.get(name) {
                return Some(v);
            }
        }
    }
    None
}

fn body_str<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    body_value(body, key, &[]).and_then(|v| v.as_str())
}

fn protocol_of(body: &Value) -> String {
    body_str(body, "protocol")
        .map(|s| s.to_string())
        .unwrap_or_else(|| "jmap".into())
}

fn provider_of(body: &Value, protocol: &str) -> String {
    body_str(body, "provider")
        .map(|s| s.to_string())
        .unwrap_or_else(|| protocol.into())
}

/// Pull the archive payload regardless of which envelope key the caller
/// used — same key list as `parseEmailArchive` in `js/src/sources/email.js`.
fn extract_archive_records(body: &Value) -> Option<&Vec<Value>> {
    if let Value::Array(arr) = body {
        return Some(arr);
    }
    for key in ARCHIVE_KEYS {
        if let Some(arr) = body.get(key).and_then(|v| v.as_array()) {
            return Some(arr);
        }
    }
    None
}

fn first_str<'a>(record: &'a Value, keys: &[&str]) -> Option<&'a str> {
    for k in keys {
        if let Some(s) = record.get(k).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    None
}

fn slugify_external_id(raw: &str, fallback_index: usize) -> String {
    let slug: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("eml-{fallback_index}")
    } else {
        trimmed
    }
}

fn normalize_record(record: &Value, index: usize) -> Value {
    let external_raw = first_str(record, &["externalId", "id", "messageId", "uid"])
        .map(String::from)
        .unwrap_or_else(|| format!("eml-{index}"));
    let external = slugify_external_id(&external_raw, index);
    let sender = first_str(record, &["sender", "from", "fromAddress"])
        .unwrap_or("unknown")
        .to_string();
    let chat = first_str(record, &["chat", "thread", "threadId", "mailbox", "subject"])
        .unwrap_or("inbox")
        .to_string();
    let body = first_str(record, &["body", "text", "plainText", "snippet", "content"])
        .unwrap_or("")
        .to_string();
    let timestamp = first_str(record, &["timestamp", "date", "receivedAt", "internalDate"])
        .map(String::from);
    let reply_to = first_str(record, &["replyTo", "inReplyTo"]).map(String::from);

    let id = format!("msg:{SOURCE}:{external}");
    let mut tokens: Vec<Value> = vec![
        Value::String("message".into()),
        Value::String(SOURCE.into()),
        Value::String(external.clone()),
    ];
    // Allow callers to pass through extra tokens for compatibility with
    // archives that already carry metadata.
    if let Some(extra) = record.get("tokens").and_then(|v| v.as_array()) {
        for tok in extra {
            if let Some(s) = tok.as_str() {
                if !tokens.iter().any(|existing| existing.as_str() == Some(s)) {
                    tokens.push(Value::String(s.into()));
                }
            }
        }
    }

    let mut children: Vec<Value> = vec![
        Value::String(format!("sender:{SOURCE}:{sender}")),
        Value::String(format!("chat:{SOURCE}:{chat}")),
        Value::String(format!("body:{SOURCE}:{external}")),
        Value::String(format!("ts:{SOURCE}:{external}")),
    ];
    if let Some(rt) = &reply_to {
        children.push(Value::String(format!("replyto:{SOURCE}:{rt}")));
    }

    let now = now_millis() as f64;
    let by = format!("source:{SOURCE}:live");
    let mut handled = json::obj();
    handled.insert("at".into(), Value::Number(now));
    handled.insert("by".into(), Value::String(by.clone()));
    let mut handled_by = json::obj();
    handled_by.insert(by, Value::Number(now));

    let mut o = json::obj();
    o.insert("id".into(), Value::String(id));
    o.insert("tokens".into(), Value::Array(tokens));
    o.insert("children".into(), Value::Array(children));
    o.insert("source".into(), Value::String(SOURCE.into()));
    o.insert("sender".into(), Value::String(sender));
    o.insert("chat".into(), Value::String(chat));
    o.insert("body".into(), Value::String(body));
    o.insert(
        "timestamp".into(),
        timestamp.map(Value::String).unwrap_or(Value::Null),
    );
    o.insert(
        "replyTo".into(),
        reply_to.map(Value::String).unwrap_or(Value::Null),
    );
    o.insert("handled".into(), Value::Object(handled));
    o.insert("handledBy".into(), Value::Object(handled_by));
    Value::Object(o)
}

/// `POST /api/email/pull` — ingest archive payloads into the store.
pub fn pull(state: &ServerState, body: &Value) -> Value {
    let protocol = protocol_of(body);
    let provider = provider_of(body, &protocol);
    let records: Vec<Value> = extract_archive_records(body)
        .cloned()
        .or_else(|| {
            body.get("message")
                .map(|m| vec![m.clone()])
                .or_else(|| body.get("record").map(|m| vec![m.clone()]))
        })
        .unwrap_or_default();

    let mut imported = 0u64;
    for (i, rec) in records.iter().enumerate() {
        let link = normalize_record(rec, i);
        state.put(link);
        imported += 1;
    }

    let raw_count = records.len() as f64;
    let mut o = json::obj();
    o.insert("source".into(), Value::String(SOURCE.into()));
    o.insert("protocol".into(), Value::String(protocol));
    o.insert("provider".into(), Value::String(provider));
    o.insert("imported".into(), Value::Number(imported as f64));
    o.insert("rawCount".into(), Value::Number(raw_count));
    o.insert("nextOffset".into(), Value::Null);
    Value::Object(o)
}

/// `POST /api/email/send` — enqueue a send record.
pub fn send(state: &ServerState, body: &Value) -> Value {
    let protocol = protocol_of(body);
    let provider = provider_of(body, &protocol);
    let message = body
        .get("message")
        .or_else(|| body.get("content"))
        .cloned()
        .unwrap_or_else(|| body.clone());
    let subject = message
        .get("subject")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let to_value = message.get("to").cloned().unwrap_or(Value::Null);
    let raw_text = message
        .get("text")
        .or_else(|| message.get("body"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let queued_at = now_millis();
    let id = format!("email-send:{queued_at}");
    let needs_local_server = RAW_PROTOCOLS.iter().any(|p| *p == protocol)
        && body_value(body, "transport", &[]).is_none();

    let status = if needs_local_server {
        "needs-local-server"
    } else {
        "queued"
    };

    let mut record = json::obj();
    record.insert("id".into(), Value::String(id.clone()));
    record.insert(
        "tokens".into(),
        Value::Array(vec![
            Value::String("email".into()),
            Value::String("send".into()),
            Value::String(protocol.clone()),
            Value::String(provider.clone()),
        ]),
    );
    record.insert("source".into(), Value::String(SOURCE.into()));
    record.insert("protocol".into(), Value::String(protocol.clone()));
    record.insert("provider".into(), Value::String(provider.clone()));
    record.insert("status".into(), Value::String(status.into()));
    record.insert("queuedAt".into(), Value::Number(queued_at as f64));
    record.insert("subject".into(), Value::String(subject.clone()));
    record.insert("to".into(), to_value);
    record.insert("text".into(), Value::String(raw_text));
    let saved = state.put(Value::Object(record));

    let mut result = json::obj();
    result.insert("id".into(), Value::String(id));
    result.insert("status".into(), Value::String(status.into()));
    if needs_local_server {
        result.insert(
            "note".into(),
            Value::String(
                "raw IMAP/POP3/SMTP delivery requires the JS server transport".into(),
            ),
        );
    }

    let mut o = json::obj();
    o.insert("source".into(), Value::String(SOURCE.into()));
    o.insert("protocol".into(), Value::String(protocol));
    o.insert("provider".into(), Value::String(provider));
    o.insert("result".into(), Value::Object(result));
    o.insert("queued".into(), saved);
    Value::Object(o)
}

/// Return `true` when the request matches a route this module owns. The
/// caller should `parse_body` and dispatch to [`pull`] / [`send`].
pub fn route_kind(req: &Request) -> Option<&'static str> {
    if req.method != "POST" {
        return None;
    }
    // Path may have query string already stripped by the http layer; be
    // defensive and tolerate trailing slashes.
    let p = req.path.trim_end_matches('/');
    let p = url_decode(p);
    match p.as_str() {
        "/api/email/pull" => Some("pull"),
        "/api/email/send" => Some("send"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn req(method: &str, path: &str) -> Request {
        Request {
            method: method.into(),
            path: path.into(),
            query: BTreeMap::new(),
            headers: BTreeMap::new(),
            body: Vec::new(),
        }
    }

    #[test]
    fn route_kind_matches_pull_and_send() {
        assert_eq!(route_kind(&req("POST", "/api/email/pull")), Some("pull"));
        assert_eq!(route_kind(&req("POST", "/api/email/send")), Some("send"));
        assert_eq!(route_kind(&req("GET", "/api/email/pull")), None);
        assert_eq!(route_kind(&req("POST", "/api/email/other")), None);
    }

    #[test]
    fn pull_imports_messages_and_returns_envelope() {
        let s = ServerState::new();
        let body = json::parse(
            r#"{
                "protocol":"gmail",
                "provider":"google",
                "messages":[
                    {"externalId":"abc","sender":"a@x.com","chat":"t1","body":"hi"}
                ]
            }"#,
        )
        .unwrap();
        let out = pull(&s, &body);
        assert_eq!(out.get("imported"), Some(&Value::Number(1.0)));
        assert_eq!(out.get("rawCount"), Some(&Value::Number(1.0)));
        assert_eq!(out.get("source"), Some(&Value::String("email".into())));
        assert_eq!(out.get("protocol"), Some(&Value::String("gmail".into())));
        assert_eq!(out.get("provider"), Some(&Value::String("google".into())));
        let stored = s.get("msg:email:abc").expect("stored msg link");
        assert_eq!(
            stored.get("body").and_then(|v| v.as_str()),
            Some("hi")
        );
        assert_eq!(
            stored.get("source").and_then(|v| v.as_str()),
            Some("email")
        );
        let tokens = stored.get("tokens").and_then(|v| v.as_array()).unwrap();
        assert!(tokens.contains(&Value::String("message".into())));
        assert!(tokens.contains(&Value::String("email".into())));
        assert!(tokens.contains(&Value::String("abc".into())));
    }

    #[test]
    fn pull_accepts_array_body_and_synthesizes_ids() {
        let s = ServerState::new();
        let body = json::parse(
            r#"[
                {"sender":"a@x.com","chat":"t","body":"first"},
                {"sender":"b@x.com","chat":"t","body":"second"}
            ]"#,
        )
        .unwrap();
        let out = pull(&s, &body);
        assert_eq!(out.get("imported"), Some(&Value::Number(2.0)));
        assert!(s.get("msg:email:eml-0").is_some());
        assert!(s.get("msg:email:eml-1").is_some());
    }

    #[test]
    fn pull_defaults_protocol_to_jmap_when_missing() {
        let s = ServerState::new();
        let body = json::parse(r#"{"messages":[]}"#).unwrap();
        let out = pull(&s, &body);
        assert_eq!(out.get("protocol"), Some(&Value::String("jmap".into())));
        assert_eq!(out.get("provider"), Some(&Value::String("jmap".into())));
        assert_eq!(out.get("imported"), Some(&Value::Number(0.0)));
    }

    #[test]
    fn send_queues_record_and_returns_envelope() {
        let s = ServerState::new();
        let body = json::parse(
            r#"{
                "protocol":"gmail",
                "message":{"to":"bob@example.com","subject":"Hi","text":"hello"}
            }"#,
        )
        .unwrap();
        let out = send(&s, &body);
        assert_eq!(out.get("source"), Some(&Value::String("email".into())));
        assert_eq!(out.get("protocol"), Some(&Value::String("gmail".into())));
        let result = out.get("result").unwrap();
        assert_eq!(
            result.get("status").and_then(|v| v.as_str()),
            Some("queued")
        );
        let id = result.get("id").and_then(|v| v.as_str()).unwrap();
        assert!(id.starts_with("email-send:"));
        let stored = s.get(id).expect("queued send is persisted");
        assert_eq!(
            stored.get("subject").and_then(|v| v.as_str()),
            Some("Hi")
        );
    }

    #[test]
    fn send_flags_raw_protocols_when_no_transport() {
        let s = ServerState::new();
        let body = json::parse(
            r#"{
                "protocol":"imap",
                "message":{"to":"bob@example.com","subject":"x"}
            }"#,
        )
        .unwrap();
        let out = send(&s, &body);
        let result = out.get("result").unwrap();
        assert_eq!(
            result.get("status").and_then(|v| v.as_str()),
            Some("needs-local-server")
        );
        assert!(result.get("note").is_some());
    }

    #[test]
    fn body_value_falls_back_to_config() {
        let body = json::parse(r#"{"config":{"protocol":"jmap"}}"#).unwrap();
        assert_eq!(protocol_of(&body), "jmap");
    }
}
