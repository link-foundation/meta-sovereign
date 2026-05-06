//! REST endpoint implementations.
//!
//! Mirrors `js/src/server/routes-derived.js` and
//! `js/src/server/routes-mutating.js` so the SPA can boot against either
//! backend. Every handler takes the parsed request and returns either
//! a [`Response`] or `None` to mean "next handler".

use std::collections::BTreeMap;

use meta_sovereign_core::{infer_regex, simplify_regex};

use crate::http::{Request, Response};
use crate::json::{self, Value};
use crate::state::ServerState;

pub const SOURCES: &[&str] = &[
    "telegram",
    "vk",
    "x",
    "whatsapp",
    "facebook",
    "linkedin",
    "habr-career",
    "hh",
    "superjob",
    "email",
    "github",
    "upwork",
    "peopleperhour",
];

const RESUME_TARGETS: &[&str] = &["hh", "habr-career", "superjob", "linkedin"];

// -- Helpers ----------------------------------------------------------------

fn json_response(status: u16, body: &Value) -> Response {
    Response::json(status, &json::encode(body))
}

fn ok_object(pairs: &[(&str, Value)]) -> Value {
    let mut o = json::obj();
    for (k, v) in pairs {
        o.insert((*k).to_string(), v.clone());
    }
    Value::Object(o)
}

fn parse_body(req: &Request) -> Result<Value, String> {
    let text = std::str::from_utf8(&req.body).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(Value::Object(json::obj()));
    }
    json::parse(text).map_err(|e| e.0)
}

fn query_param<'a>(req: &'a Request, key: &str) -> Option<&'a str> {
    req.query.get(key).map(String::as_str)
}

fn err(status: u16, msg: &str) -> Response {
    let mut o = json::obj();
    o.insert("error".into(), Value::String(msg.into()));
    json_response(status, &Value::Object(o))
}

// -- Sources ----------------------------------------------------------------

pub fn sources(_req: &Request) -> Response {
    let arr: Vec<Value> = SOURCES.iter().map(|s| Value::String((*s).into())).collect();
    json_response(200, &Value::Array(arr))
}

// -- Links ------------------------------------------------------------------

pub fn links(state: &ServerState, req: &Request) -> Option<Response> {
    if req.path == "/links" && req.method == "GET" {
        let arr: Vec<Value> = state.query();
        return Some(json_response(200, &Value::Array(arr)));
    }
    if req.path == "/links" && req.method == "PUT" {
        let body = match parse_body(req) {
            Ok(v) => v,
            Err(e) => return Some(err(400, &format!("bad body: {e}"))),
        };
        let saved = state.put(body);
        return Some(json_response(200, &saved));
    }
    if let Some(rest) = req.path.strip_prefix("/links/") {
        let id = url_decode(rest);
        if req.method == "GET" {
            return Some(match state.get(&id) {
                Some(v) => json_response(200, &v),
                None => err(404, "not found"),
            });
        }
        if req.method == "DELETE" {
            let ok = state.delete(&id);
            let mut o = json::obj();
            o.insert("ok".into(), Value::Bool(ok));
            return Some(json_response(if ok { 200 } else { 404 }, &Value::Object(o)));
        }
    }
    None
}

// -- Status, contacts, autocomplete, audience, facts, search, health -------

fn status(state: &ServerState) -> Value {
    let all = state.query();
    let count_prefix = |p: &str| -> usize {
        all.iter()
            .filter(|l| {
                l.get("id")
                    .and_then(|v| v.as_str())
                    .is_some_and(|id| id.starts_with(p))
            })
            .count()
    };
    let mut chats = std::collections::HashSet::new();
    for l in &all {
        if let Some(id) = l.get("id").and_then(|v| v.as_str()) {
            if id.starts_with("msg:") {
                let source = l.get("source").and_then(|v| v.as_str()).unwrap_or("");
                let chat = l.get("chat").and_then(|v| v.as_str()).unwrap_or("");
                chats.insert(format!("{source}:{chat}"));
            }
        }
    }
    let contacts = aggregate_contacts(&all).len();
    ok_object(&[
        ("links", Value::Number(all.len() as f64)),
        ("messages", Value::Number(count_prefix("msg:") as f64)),
        ("patterns", Value::Number(count_prefix("pattern:") as f64)),
        ("graphs", Value::Number(count_prefix("graph:") as f64)),
        ("replies", Value::Number(count_prefix("reply:") as f64)),
        ("contacts", Value::Number(contacts as f64)),
        ("chats", Value::Number(chats.len() as f64)),
        ("verifyDiffs", Value::Number(0.0)),
    ])
}

fn aggregate_contacts(all: &[Value]) -> Vec<Value> {
    let mut by_contact: BTreeMap<String, ContactBuilder> = BTreeMap::new();
    for l in all {
        let id = l.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if !id.starts_with("msg:") {
            continue;
        }
        let sender = match l.get("sender").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let source = l
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let chat = l
            .get("chat")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let timestamp = l
            .get("timestamp")
            .and_then(|v| v.as_str())
            .map(String::from);
        let entry = by_contact
            .entry(sender.clone())
            .or_insert_with(|| ContactBuilder {
                id: sender.clone(),
                networks: std::collections::BTreeSet::new(),
                chats: std::collections::BTreeSet::new(),
                message_count: 0,
                last_seen: None,
            });
        entry.networks.insert(source);
        entry.chats.insert(chat);
        entry.message_count += 1;
        if let Some(ts) = timestamp {
            if entry
                .last_seen
                .as_deref()
                .is_none_or(|cur| ts.as_str() > cur)
            {
                entry.last_seen = Some(ts);
            }
        }
    }
    by_contact
        .into_values()
        .map(ContactBuilder::into_value)
        .collect()
}

struct ContactBuilder {
    id: String,
    networks: std::collections::BTreeSet<String>,
    chats: std::collections::BTreeSet<String>,
    message_count: u64,
    last_seen: Option<String>,
}

impl ContactBuilder {
    fn into_value(self) -> Value {
        let networks: Vec<Value> = self.networks.into_iter().map(Value::String).collect();
        let chats: Vec<Value> = self.chats.into_iter().map(Value::String).collect();
        ok_object(&[
            ("id", Value::String(self.id)),
            ("networks", Value::Array(networks)),
            ("chats", Value::Array(chats)),
            ("messageCount", Value::Number(self.message_count as f64)),
            (
                "lastSeen",
                self.last_seen.map(Value::String).unwrap_or(Value::Null),
            ),
        ])
    }
}

fn autocomplete(state: &ServerState, req: &Request) -> Value {
    let q = query_param(req, "q").unwrap_or("").to_lowercase();
    let me = query_param(req, "me").unwrap_or("me").to_string();
    let limit: usize = query_param(req, "limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);
    let all = state.query();
    let mut seen: BTreeMap<String, String> = BTreeMap::new();
    for l in &all {
        let id = l.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if !id.starts_with("msg:") {
            continue;
        }
        if l.get("sender").and_then(|v| v.as_str()) != Some(me.as_str()) {
            continue;
        }
        let body = match l.get("body").and_then(|v| v.as_str()) {
            Some(b) => b.to_string(),
            None => continue,
        };
        if !body.to_lowercase().starts_with(&q) {
            continue;
        }
        let ts = l
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        seen.entry(body)
            .and_modify(|cur| {
                if ts > *cur {
                    *cur = ts.clone();
                }
            })
            .or_insert(ts);
    }
    let mut entries: Vec<(String, String)> = seen.into_iter().collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1));
    let arr: Vec<Value> = entries
        .into_iter()
        .take(limit)
        .map(|(b, _)| Value::String(b))
        .collect();
    Value::Array(arr)
}

fn audience(state: &ServerState, req: &Request) -> Value {
    // Minimal evaluator: accepts terms separated by `&` (intersection)
    // and `|` (union); each term is `token`, `network:foo`, or
    // `chat:foo`. Mirrors the JS audience DSL closely enough for the
    // SPA to render previews from this Rust backend.
    let q = query_param(req, "q").unwrap_or("").trim().to_string();
    let all = state.query();
    let filtered = if q.is_empty() {
        all
    } else {
        eval_audience(&all, &q)
    };
    Value::Array(aggregate_contacts(&filtered))
}

fn link_matches_term(link: &Value, term: &str) -> bool {
    let term = term.trim();
    if term.is_empty() {
        return true;
    }
    if let Some(network) = term.strip_prefix("network:") {
        return link.get("source").and_then(|v| v.as_str()) == Some(network);
    }
    if let Some(chat) = term.strip_prefix("chat:") {
        return link.get("chat").and_then(|v| v.as_str()) == Some(chat);
    }
    let body_match = link
        .get("body")
        .and_then(|v| v.as_str())
        .is_some_and(|b| b.to_lowercase().contains(&term.to_lowercase()));
    let token_match = link
        .get("tokens")
        .and_then(|v| v.as_array())
        .is_some_and(|a| a.iter().any(|t| t.as_str() == Some(term)));
    body_match || token_match
}

fn eval_audience(all: &[Value], q: &str) -> Vec<Value> {
    let union_parts: Vec<&str> = q.split('|').collect();
    let mut out: Vec<Value> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    for part in union_parts {
        let intersect_terms: Vec<&str> = part.split('&').collect();
        for link in all {
            if intersect_terms.iter().all(|t| link_matches_term(link, t)) {
                if let Some(id) = link.get("id").and_then(|v| v.as_str()) {
                    if seen_ids.insert(id.to_string()) {
                        out.push(link.clone());
                    }
                }
            }
        }
    }
    out
}

fn facts(state: &ServerState) -> Value {
    // Minimal port: pair every "?" question message with the next
    // message in the same chat from a different sender. Mirrors the
    // tail of the JS extractor's behaviour for the SPA preview.
    let all = state.query();
    let mut messages: Vec<&Value> = all
        .iter()
        .filter(|l| {
            l.get("id")
                .and_then(|v| v.as_str())
                .is_some_and(|id| id.starts_with("msg:"))
        })
        .collect();
    messages.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        let tb = b.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");
        ta.cmp(tb)
    });
    let mut out = Vec::new();
    for (i, q) in messages.iter().enumerate() {
        let body = q.get("body").and_then(|v| v.as_str()).unwrap_or("");
        if !body.contains('?') {
            continue;
        }
        let chat = q.get("chat").and_then(|v| v.as_str()).unwrap_or("");
        let sender = q.get("sender").and_then(|v| v.as_str()).unwrap_or("");
        for a in &messages[i + 1..] {
            let achat = a.get("chat").and_then(|v| v.as_str()).unwrap_or("");
            let asender = a.get("sender").and_then(|v| v.as_str()).unwrap_or("");
            if achat == chat && asender != sender {
                let abody = a.get("body").and_then(|v| v.as_str()).unwrap_or("");
                out.push(ok_object(&[
                    ("partner", Value::String(asender.into())),
                    ("question", Value::String(body.into())),
                    ("answer", Value::String(abody.into())),
                ]));
                break;
            }
        }
    }
    Value::Array(out)
}

fn dice_similarity(a: &str, b: &str) -> f64 {
    let bigrams = |s: &str| -> std::collections::HashMap<String, u32> {
        let chars: Vec<char> = s.to_lowercase().chars().collect();
        let mut m = std::collections::HashMap::new();
        for w in chars.windows(2) {
            let key: String = w.iter().collect();
            *m.entry(key).or_insert(0) += 1;
        }
        m
    };
    let ba = bigrams(a);
    let bb = bigrams(b);
    let mut overlap = 0u32;
    for (k, &va) in &ba {
        if let Some(&vb) = bb.get(k) {
            overlap += va.min(vb);
        }
    }
    let total: u32 = ba.values().sum::<u32>() + bb.values().sum::<u32>();
    if total == 0 {
        0.0
    } else {
        2.0 * overlap as f64 / total as f64
    }
}

fn search(state: &ServerState, req: &Request) -> Value {
    let q = query_param(req, "q").unwrap_or("");
    let min: f64 = query_param(req, "min")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.2);
    let mut hits: Vec<(f64, Value)> = Vec::new();
    for link in state.query() {
        let body = link.get("body").and_then(|v| v.as_str()).unwrap_or("");
        let score = dice_similarity(q, body);
        if score >= min {
            hits.push((score, link));
        }
    }
    hits.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Value::Array(
        hits.into_iter()
            .map(|(score, link)| ok_object(&[("score", Value::Number(score)), ("link", link)]))
            .collect(),
    )
}

fn health(state: &ServerState) -> Value {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    ok_object(&[
        ("ok", Value::Bool(true)),
        ("links", Value::Number(state.len() as f64)),
        ("time", Value::String(format!("{now}"))),
    ])
}

pub fn derived(state: &ServerState, req: &Request) -> Option<Response> {
    if req.method != "GET" {
        return None;
    }
    let body = match req.path.as_str() {
        "/api/contacts" => Value::Array(aggregate_contacts(&state.query())),
        "/api/status" => status(state),
        "/api/autocomplete" => autocomplete(state, req),
        "/api/audience" => audience(state, req),
        "/api/facts" => facts(state),
        "/api/search" => search(state, req),
        "/api/health" => health(state),
        _ => return None,
    };
    Some(json_response(200, &body))
}

// -- Patterns / graphs / replies / profile / resume / broadcast ------------

fn prefixed_get(state: &ServerState, prefix: &str) -> Response {
    let arr: Vec<Value> = state
        .query()
        .into_iter()
        .filter(|l| {
            l.get("id")
                .and_then(|v| v.as_str())
                .is_some_and(|id| id.starts_with(prefix))
        })
        .collect();
    json_response(200, &Value::Array(arr))
}

fn prefixed_put(state: &ServerState, req: &Request, prefix: &str, kind: &str) -> Response {
    let body = match parse_body(req) {
        Ok(v) => v,
        Err(e) => return err(400, &format!("bad body: {e}")),
    };
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if !id.starts_with(&format!("{prefix}:")) {
        return err(400, &format!("{kind}.id must start with \"{prefix}:\""));
    }
    let saved = state.put(body);
    json_response(200, &saved)
}

fn pattern_infer(req: &Request) -> Response {
    let body = match parse_body(req) {
        Ok(v) => v,
        Err(e) => return err(400, &format!("bad body: {e}")),
    };
    let examples: Vec<String> = body
        .get("examples")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let refs: Vec<&str> = examples.iter().map(String::as_str).collect();
    let regex = simplify_regex(&infer_regex(&refs));
    let mut o = json::obj();
    o.insert("regex".into(), Value::String(regex));
    o.insert("flags".into(), Value::String("i".into()));
    json_response(200, &Value::Object(o))
}

fn graph_run(state: &ServerState, req: &Request) -> Response {
    let body = match parse_body(req) {
        Ok(v) => v,
        Err(e) => return err(400, &format!("bad body: {e}")),
    };
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let message = body.get("message").and_then(|v| v.as_str()).unwrap_or("");
    let mode = body
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("semi")
        .to_string();
    let persisted = match state.get(id) {
        Some(v) => v,
        None => return err(404, &format!("graph {id} not found")),
    };
    Some(persisted)
        .map(|graph| {
            // Minimal graph runner: walk `edges`; for each `from`/`to`
            // pair where `from.regex` matches the message, append the
            // node id to the plan. Keeps the SPA's "plan preview" panel
            // alive when running against the Rust server.
            let nodes = graph
                .get("nodes")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let edges = graph
                .get("edges")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let node_by_id: std::collections::HashMap<String, &Value> = nodes
                .iter()
                .filter_map(|n| {
                    n.get("id")
                        .and_then(|v| v.as_str())
                        .map(|id| (id.to_string(), n))
                })
                .collect();
            let mut plan: Vec<Value> = Vec::new();
            let mut last_match: Option<String> = None;
            for n in &nodes {
                let regex = n.get("regex").and_then(|v| v.as_str()).unwrap_or("");
                if regex.is_empty() {
                    continue;
                }
                if meta_sovereign_core::pattern_matches(regex, message) {
                    let nid = n
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    plan.push(ok_object(&[
                        ("step", Value::String("match".into())),
                        ("node", Value::String(nid.clone())),
                    ]));
                    last_match = Some(nid);
                    break;
                }
            }
            if let Some(matched) = last_match {
                for edge in &edges {
                    if edge.get("from").and_then(|v| v.as_str()) == Some(&matched) {
                        if let Some(to) = edge.get("to").and_then(|v| v.as_str()) {
                            if let Some(node) = node_by_id.get(to) {
                                plan.push(ok_object(&[
                                    ("step", Value::String("follow".into())),
                                    ("node", Value::String(to.into())),
                                    ("group", node.get("group").cloned().unwrap_or(Value::Null)),
                                ]));
                            }
                        }
                    }
                }
            }
            json_response(
                200,
                &ok_object(&[
                    ("graphId", Value::String(id.into())),
                    ("mode", Value::String(mode)),
                    ("message", Value::String(message.into())),
                    ("plan", Value::Array(plan)),
                ]),
            )
        })
        .unwrap()
}

pub fn mutating(state: &ServerState, req: &Request) -> Option<Response> {
    if let Some(r) = links(state, req) {
        return Some(r);
    }
    let p = req.path.as_str();
    let m = req.method.as_str();
    let res = match (p, m) {
        ("/api/patterns", "GET") => prefixed_get(state, "pattern:"),
        ("/api/patterns", "PUT") => prefixed_put(state, req, "pattern", "pattern"),
        ("/api/patterns/infer", "POST") => pattern_infer(req),
        ("/api/graphs", "GET") => prefixed_get(state, "graph:"),
        ("/api/graphs", "PUT") => prefixed_put(state, req, "graph", "graph"),
        ("/api/graphs/run", "POST") => graph_run(state, req),
        ("/api/replies", "GET") => prefixed_get(state, "reply:"),
        ("/api/replies", "PUT") => prefixed_put(state, req, "reply", "reply"),
        ("/api/profile", "GET") => match state.get("profile:me") {
            Some(v) => json_response(200, &v),
            None => json_response(
                200,
                &ok_object(&[
                    ("id", Value::String("profile:me".into())),
                    (
                        "tokens",
                        Value::Array(vec![Value::String("profile".into())]),
                    ),
                ]),
            ),
        },
        ("/api/profile", "PUT") => {
            let body = match parse_body(req) {
                Ok(v) => v,
                Err(e) => return Some(err(400, &format!("bad body: {e}"))),
            };
            let mut map = match body {
                Value::Object(o) => o,
                _ => json::obj(),
            };
            map.insert("id".into(), Value::String("profile:me".into()));
            map.entry("tokens".into())
                .or_insert(Value::Array(vec![Value::String("profile".into())]));
            let saved = state.put(Value::Object(map));
            let plans: Vec<Value> = SOURCES
                .iter()
                .map(|s| {
                    ok_object(&[
                        ("source", Value::String((*s).into())),
                        ("status", Value::String("queued".into())),
                    ])
                })
                .collect();
            json_response(
                200,
                &ok_object(&[("profile", saved), ("plannedSyncs", Value::Array(plans))]),
            )
        }
        ("/api/resume", "GET") => match state.get("resume:me") {
            Some(v) => json_response(200, &v),
            None => json_response(
                200,
                &ok_object(&[
                    ("id", Value::String("resume:me".into())),
                    ("tokens", Value::Array(vec![Value::String("resume".into())])),
                ]),
            ),
        },
        ("/api/resume", "PUT") => {
            let body = match parse_body(req) {
                Ok(v) => v,
                Err(e) => return Some(err(400, &format!("bad body: {e}"))),
            };
            let mut map = match body {
                Value::Object(o) => o,
                _ => json::obj(),
            };
            map.insert("id".into(), Value::String("resume:me".into()));
            map.entry("tokens".into())
                .or_insert(Value::Array(vec![Value::String("resume".into())]));
            let saved = state.put(Value::Object(map));
            let plans: Vec<Value> = RESUME_TARGETS
                .iter()
                .map(|s| {
                    ok_object(&[
                        ("source", Value::String((*s).into())),
                        ("status", Value::String("queued".into())),
                    ])
                })
                .collect();
            json_response(
                200,
                &ok_object(&[("resume", saved), ("plannedSyncs", Value::Array(plans))]),
            )
        }
        ("/api/broadcast", "POST") => {
            let body = match parse_body(req) {
                Ok(v) => v,
                Err(e) => return Some(err(400, &format!("bad body: {e}"))),
            };
            let text = body
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut requested: Vec<String> = body
                .get("networks")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_else(|| SOURCES.iter().map(|s| (*s).into()).collect());
            requested.retain(|n| SOURCES.contains(&n.as_str()));
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let id = format!("broadcast:{now}");
            let mut tokens: Vec<Value> = vec![Value::String("broadcast".into())];
            tokens.extend(requested.iter().map(|n| Value::String(n.clone())));
            let networks: Vec<Value> = requested.iter().map(|n| Value::String(n.clone())).collect();
            let post = ok_object(&[
                ("id", Value::String(id)),
                ("tokens", Value::Array(tokens)),
                ("body", Value::String(text)),
                ("networks", Value::Array(networks)),
                ("timestamp", Value::String(format!("{now}"))),
                ("status", Value::String("queued".into())),
            ]);
            let saved = state.put(post);
            json_response(200, &saved)
        }
        _ => return None,
    };
    Some(res)
}

// -- Metrics ----------------------------------------------------------------

/// Render the Prometheus exposition mirror of Node's `collectMetrics`.
/// Counts links by id-prefix and exposes WebSocket peer + WebRTC room
/// totals supplied by the caller (the HTTP layer owns those handles).
pub fn metrics_text(state: &ServerState, ws_peers: usize, rtc_rooms: usize) -> String {
    let all = state.query();
    let total = all.len();
    let count_prefix = |p: &str| -> usize {
        all.iter()
            .filter(|l| {
                l.get("id")
                    .and_then(|v| v.as_str())
                    .is_some_and(|id| id.starts_with(p))
            })
            .count()
    };
    let kinds = [
        ("message", "msg:"),
        ("pattern", "pattern:"),
        ("graph", "graph:"),
        ("reply", "reply:"),
        ("broadcast", "broadcast:"),
        ("contact", "contact:"),
        ("profile", "profile:"),
        ("resume", "resume:"),
        ("secret", "secret:"),
    ];
    let mut out = String::new();
    out.push_str("# HELP meta_sovereign_links_total Total links in the store.\n");
    out.push_str("# TYPE meta_sovereign_links_total gauge\n");
    out.push_str(&format!("meta_sovereign_links_total {total}\n"));
    out.push_str(
        "# HELP meta_sovereign_links_by_kind Links grouped by id prefix \
         (msg, pattern, graph, reply, ...).\n",
    );
    out.push_str("# TYPE meta_sovereign_links_by_kind gauge\n");
    for (kind, prefix) in kinds {
        let n = count_prefix(prefix);
        out.push_str(&format!(
            "meta_sovereign_links_by_kind{{kind=\"{kind}\"}} {n}\n"
        ));
    }
    out.push_str("# HELP meta_sovereign_ws_peers Connected WebSocket sync peers.\n");
    out.push_str("# TYPE meta_sovereign_ws_peers gauge\n");
    out.push_str(&format!("meta_sovereign_ws_peers {ws_peers}\n"));
    out.push_str("# HELP meta_sovereign_rtc_rooms Active WebRTC signaling rooms.\n");
    out.push_str("# TYPE meta_sovereign_rtc_rooms gauge\n");
    out.push_str(&format!("meta_sovereign_rtc_rooms {rtc_rooms}\n"));
    out
}

// -- URL decode -------------------------------------------------------------

pub fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%' && i + 2 < bytes.len() {
            let hi = hex_digit(bytes[i + 1]);
            let lo = hex_digit(bytes[i + 2]);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        if b == b'+' {
            out.push(b' ');
        } else {
            out.push(b);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_digit(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(10 + c - b'a'),
        b'A'..=b'F' => Some(10 + c - b'A'),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(method: &str, path: &str, body: &str) -> Request {
        Request {
            method: method.into(),
            path: path.into(),
            query: BTreeMap::new(),
            headers: BTreeMap::new(),
            body: body.as_bytes().to_vec(),
        }
    }

    #[test]
    fn put_and_get_link_round_trips() {
        let s = ServerState::new();
        let body = "{\"id\":\"x:1\",\"tokens\":[\"x\"],\"k\":\"v\"}";
        let r = links(&s, &req("PUT", "/links", body)).unwrap();
        assert_eq!(r.status, 200);
        let g = links(&s, &req("GET", "/links/x:1", "")).unwrap();
        assert_eq!(g.status, 200);
        assert!(g.body_string().contains("\"k\":\"v\""));
    }

    #[test]
    fn delete_returns_ok_payload() {
        let s = ServerState::new();
        s.put(json::parse("{\"id\":\"x:1\"}").unwrap());
        let r = links(&s, &req("DELETE", "/links/x:1", "")).unwrap();
        assert_eq!(r.status, 200);
        assert!(r.body_string().contains("\"ok\":true"));
    }

    #[test]
    fn pattern_infer_returns_regex_and_flags() {
        let body = "{\"examples\":[\"hi a\",\"hi b\"]}";
        let r = pattern_infer(&req("POST", "/api/patterns/infer", body));
        assert_eq!(r.status, 200);
        let s = r.body_string();
        assert!(s.contains("\"regex\":"));
        assert!(s.contains("\"flags\":\"i\""));
    }

    #[test]
    fn sources_listing_matches_known_set() {
        let r = sources(&req("GET", "/sources", ""));
        let s = r.body_string();
        for src in SOURCES {
            assert!(s.contains(src));
        }
    }

    #[test]
    fn status_counts_messages() {
        let s = ServerState::new();
        s.put(
            json::parse("{\"id\":\"msg:t:1\",\"sender\":\"a\",\"source\":\"t\",\"chat\":\"c\"}")
                .unwrap(),
        );
        let st = status(&s);
        assert_eq!(
            st.get("messages").and_then(|v| match v {
                Value::Number(n) => Some(*n as i64),
                _ => None,
            }),
            Some(1)
        );
    }

    #[test]
    fn url_decode_handles_percent_and_plus() {
        assert_eq!(url_decode("a%3Ab"), "a:b");
        assert_eq!(url_decode("a+b"), "a b");
    }
}
