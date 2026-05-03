//! Top-level route dispatch — picks the right handler in
//! `crate::handlers` for an incoming HTTP request, or serves the
//! bundled SPA assets.
//!
//! Mirrors the `route()` function in `js/src/server/index.js`, including
//! the precedence: static assets → `/sources` → mutating routes →
//! derived routes → 404.

use std::path::PathBuf;

use crate::email;
use crate::handlers;
use crate::http::{Request, Response};
use crate::json;
use crate::state::ServerState;

pub struct StaticRoot {
    pub path: Option<PathBuf>,
}

impl StaticRoot {
    pub fn new(path: Option<PathBuf>) -> Self {
        Self { path }
    }
}

/// Live counts the metrics endpoint mirrors back. Kept separate from
/// [`ServerState`] because the underlying handles live in the HTTP
/// layer (WebSocket peers, WebRTC signaling rooms).
#[derive(Default, Clone, Copy)]
pub struct MetricsCtx {
    pub ws_peers: usize,
    pub rtc_rooms: usize,
}

fn ext_mime(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if lower.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if lower.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if lower.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".wasm") {
        "application/wasm"
    } else {
        "application/octet-stream"
    }
}

fn safe_asset_name(p: &str) -> Option<String> {
    let trimmed = p.trim_start_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains("..") || trimmed.contains('/') {
        return None;
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return None;
    }
    Some(trimmed.to_string())
}

/// Browser-safe sibling directories the SPA imports from. The path
/// after the prefix must be a single flat `.js` file name.
const BROWSER_MOUNTS: &[(&str, &str)] = &[
    ("/storage/", "storage"),
    ("/handlers/", "handlers"),
    ("/sync/", "sync"),
];

fn serve_browser_mount(root: &StaticRoot, req: &Request) -> Option<Response> {
    if req.method != "GET" {
        return None;
    }
    let dir = root.path.as_ref()?;
    let parent = dir.parent()?; // points at js/src/
    for (prefix, sub) in BROWSER_MOUNTS {
        if let Some(tail) = req.path.strip_prefix(prefix) {
            if tail.is_empty() || tail.contains('/') || tail.contains("..") {
                continue;
            }
            if !tail
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
            {
                continue;
            }
            if !tail.ends_with(".js") {
                continue;
            }
            let mount_dir = parent.join(sub);
            let file = mount_dir.join(tail);
            // Defence-in-depth: keep resolved path inside the mount dir.
            if !file.starts_with(&mount_dir) {
                continue;
            }
            let bytes = std::fs::read(&file).ok()?;
            return Some(Response::bytes(200, ext_mime(tail), bytes));
        }
    }
    None
}

fn serve_static(root: &StaticRoot, req: &Request) -> Option<Response> {
    if req.method != "GET" {
        return None;
    }
    let dir = root.path.as_ref()?;
    if req.path == "/" || req.path == "/index.html" {
        let file = dir.join("index.html");
        let bytes = std::fs::read(&file).ok()?;
        return Some(Response::bytes(200, "text/html; charset=utf-8", bytes));
    }
    if let Some(name) = safe_asset_name(&req.path) {
        if name.ends_with(".js")
            || name.ends_with(".css")
            || name.ends_with(".svg")
            || name.ends_with(".wasm")
        {
            let file = dir.join(&name);
            if let Ok(bytes) = std::fs::read(&file) {
                return Some(Response::bytes(200, ext_mime(&name), bytes));
            }
        }
    }
    serve_browser_mount(root, req)
}

pub fn dispatch(
    state: &ServerState,
    root: &StaticRoot,
    req: &Request,
    metrics: MetricsCtx,
) -> Response {
    if let Some(r) = serve_static(root, req) {
        return r;
    }
    if req.path == "/sources" && req.method == "GET" {
        return handlers::sources(req);
    }
    if req.path == "/metrics" && req.method == "GET" {
        let body = handlers::metrics_text(state, metrics.ws_peers, metrics.rtc_rooms);
        return Response::bytes(200, "text/plain; version=0.0.4", body.into_bytes());
    }
    if let Some(kind) = email::route_kind(req) {
        return dispatch_email(state, req, kind);
    }
    if let Some(r) = handlers::mutating(state, req) {
        return r;
    }
    if let Some(r) = handlers::derived(state, req) {
        return r;
    }
    Response::json(404, "{\"error\":\"unknown route\"}")
}

/// Mirror `handleEmail` in `js/src/server/routes-mutating.js` — parses
/// the request body and dispatches to [`email::pull`] or [`email::send`].
fn dispatch_email(state: &ServerState, req: &Request, kind: &str) -> Response {
    let text = std::str::from_utf8(&req.body).unwrap_or_default();
    let body = if text.trim().is_empty() {
        json::Value::Object(json::obj())
    } else {
        match json::parse(text) {
            Ok(v) => v,
            Err(e) => {
                let msg = format!("{{\"error\":\"bad body: {}\"}}", e.0.replace('"', "'"));
                return Response::json(400, &msg);
            }
        }
    };
    let value = match kind {
        "pull" => email::pull(state, &body),
        "send" => email::send(state, &body),
        _ => return Response::json(404, "{\"error\":\"unknown email route\"}"),
    };
    Response::json(200, &json::encode(&value))
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

    fn ctx() -> MetricsCtx {
        MetricsCtx::default()
    }

    #[test]
    fn unknown_route_returns_404() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let r = dispatch(&s, &root, &req("GET", "/no/such"), ctx());
        assert_eq!(r.status, 404);
    }

    #[test]
    fn sources_listed_via_dispatch() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let r = dispatch(&s, &root, &req("GET", "/sources"), ctx());
        assert_eq!(r.status, 200);
        assert!(r.body_string().contains("telegram"));
    }

    #[test]
    fn safe_asset_name_rejects_dotdot() {
        assert!(safe_asset_name("/../etc/passwd").is_none());
        assert!(safe_asset_name("/foo/bar.js").is_none());
        assert_eq!(safe_asset_name("/app.js").as_deref(), Some("app.js"));
    }

    fn body_req(method: &str, path: &str, body: &str) -> Request {
        Request {
            method: method.into(),
            path: path.into(),
            query: BTreeMap::new(),
            headers: BTreeMap::new(),
            body: body.as_bytes().to_vec(),
        }
    }

    #[test]
    fn email_pull_dispatch_persists_message_link() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let body = r#"{"protocol":"gmail","messages":[
            {"externalId":"abc","sender":"a@x.com","chat":"t","body":"hi"}
        ]}"#;
        let r = dispatch(
            &s,
            &root,
            &body_req("POST", "/api/email/pull", body),
            ctx(),
        );
        assert_eq!(r.status, 200);
        let txt = r.body_string();
        assert!(txt.contains("\"imported\":1"));
        assert!(txt.contains("\"source\":\"email\""));
        let g = dispatch(
            &s,
            &root,
            &body_req("GET", "/links/msg%3Aemail%3Aabc", ""),
            ctx(),
        );
        assert_eq!(g.status, 200);
        assert!(g.body_string().contains("\"body\":\"hi\""));
    }

    #[test]
    fn email_send_dispatch_returns_queued_envelope() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let body = r#"{"protocol":"jmap","message":{"to":"b@x","subject":"hi","text":"x"}}"#;
        let r = dispatch(
            &s,
            &root,
            &body_req("POST", "/api/email/send", body),
            ctx(),
        );
        assert_eq!(r.status, 200);
        let txt = r.body_string();
        assert!(txt.contains("\"status\":\"queued\""));
        assert!(txt.contains("\"protocol\":\"jmap\""));
    }

    #[test]
    fn email_send_dispatch_flags_raw_protocols() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let body = r#"{"protocol":"smtp","message":{"to":"b@x","subject":"hi"}}"#;
        let r = dispatch(
            &s,
            &root,
            &body_req("POST", "/api/email/send", body),
            ctx(),
        );
        assert_eq!(r.status, 200);
        assert!(r.body_string().contains("\"status\":\"needs-local-server\""));
    }

    #[test]
    fn email_pull_dispatch_rejects_bad_body() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let r = dispatch(
            &s,
            &root,
            &body_req("POST", "/api/email/pull", "{not-json"),
            ctx(),
        );
        assert_eq!(r.status, 400);
    }

    #[test]
    fn sources_listing_includes_email() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let r = dispatch(&s, &root, &req("GET", "/sources"), ctx());
        assert_eq!(r.status, 200);
        assert!(r.body_string().contains("email"));
    }

    #[test]
    fn browser_mount_serves_sibling_directory_files() {
        // The repository's own js/src/ tree is laid out exactly the way
        // the Rust server expects (web/ alongside storage/, handlers/,
        // sync/), so we anchor on it instead of building a fixture.
        let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo_root = manifest.ancestors().nth(3).unwrap();
        let web_root = repo_root.join("js").join("src").join("web");
        if !web_root.join("index.html").exists() {
            // Test runs from a packaged crate without the JS tree.
            return;
        }
        let s = ServerState::new();
        let root = StaticRoot::new(Some(web_root));

        let r = dispatch(&s, &root, &req("GET", "/storage/browser-store.js"), ctx());
        assert_eq!(r.status, 200, "/storage/browser-store.js");

        let r = dispatch(&s, &root, &req("GET", "/pattern-matcher.wasm"), ctx());
        assert_eq!(r.status, 200, "/pattern-matcher.wasm");
        assert_eq!(r.headers[0].1, "application/wasm");

        let r = dispatch(&s, &root, &req("GET", "/handlers/index.js"), ctx());
        assert_eq!(r.status, 200, "/handlers/index.js");

        // Defence-in-depth: traversal escape attempts return 404.
        let r = dispatch(&s, &root, &req("GET", "/storage/../etc/passwd"), ctx());
        assert_eq!(r.status, 404);

        // Only `.js` files are served from mount dirs.
        let r = dispatch(&s, &root, &req("GET", "/storage/notes.txt"), ctx());
        assert_eq!(r.status, 404);

        // Nested paths inside a mount are rejected (single flat file
        // only) so we never expose subdirectories by accident.
        let r = dispatch(&s, &root, &req("GET", "/storage/sub/inner.js"), ctx());
        assert_eq!(r.status, 404);

        // Unknown mount prefixes still 404 even when the file would
        // exist relative to src/.
        let r = dispatch(&s, &root, &req("GET", "/cli/index.js"), ctx());
        assert_eq!(r.status, 404);
    }
}
