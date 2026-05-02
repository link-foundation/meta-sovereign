//! Top-level route dispatch — picks the right handler in
//! `crate::handlers` for an incoming HTTP request, or serves the
//! bundled SPA assets.
//!
//! Mirrors the `route()` function in `src/server/index.js`, including
//! the precedence: static assets → `/sources` → mutating routes →
//! derived routes → 404.

use std::path::PathBuf;

use crate::handlers;
use crate::http::{Request, Response};
use crate::state::ServerState;

pub struct StaticRoot {
    pub path: Option<PathBuf>,
}

impl StaticRoot {
    pub fn new(path: Option<PathBuf>) -> Self {
        Self { path }
    }
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
    let name = safe_asset_name(&req.path)?;
    if !(name.ends_with(".js") || name.ends_with(".css") || name.ends_with(".svg")) {
        return None;
    }
    let file = dir.join(&name);
    let bytes = std::fs::read(&file).ok()?;
    Some(Response::bytes(200, ext_mime(&name), bytes))
}

pub fn dispatch(state: &ServerState, root: &StaticRoot, req: &Request) -> Response {
    if let Some(r) = serve_static(root, req) {
        return r;
    }
    if req.path == "/sources" && req.method == "GET" {
        return handlers::sources(req);
    }
    if let Some(r) = handlers::mutating(state, req) {
        return r;
    }
    if let Some(r) = handlers::derived(state, req) {
        return r;
    }
    Response::json(404, "{\"error\":\"unknown route\"}")
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
    fn unknown_route_returns_404() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let r = dispatch(&s, &root, &req("GET", "/no/such"));
        assert_eq!(r.status, 404);
    }

    #[test]
    fn sources_listed_via_dispatch() {
        let s = ServerState::new();
        let root = StaticRoot::new(None);
        let r = dispatch(&s, &root, &req("GET", "/sources"));
        assert_eq!(r.status, 200);
        assert!(r.body_string().contains("telegram"));
    }

    #[test]
    fn safe_asset_name_rejects_dotdot() {
        assert!(safe_asset_name("/../etc/passwd").is_none());
        assert!(safe_asset_name("/foo/bar.js").is_none());
        assert_eq!(safe_asset_name("/app.js").as_deref(), Some("app.js"));
    }
}
