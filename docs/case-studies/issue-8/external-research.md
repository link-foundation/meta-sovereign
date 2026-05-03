# Issue #8 — External research

This document records the external (non-issue) research used while
producing the solution plan. Citations are full URLs so reviewers
can re-check claims; nothing here is paraphrased without a source.

## 1. GitHub Pages publishing model

The historical "push to `gh-pages`" branch deploy is still
supported, but since 2022 GitHub recommends the **Actions-driven
Pages deploy** built around three first-party actions:

- `actions/configure-pages` — configures the site's runtime
  parameters (origin, base path).
- `actions/upload-pages-artifact` — packages a directory as a Pages
  artifact for deployment.
- `actions/deploy-pages` — deploys the artifact and reports the
  deployment URL.

The Actions-driven model is the current GitHub-recommended path:
<https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow>

Required workflow permissions (per `actions/deploy-pages` README at
<https://github.com/actions/deploy-pages>):

```yaml
permissions:
  contents: read
  pages: write
  id-token: write

environment:
  name: github-pages
  url: ${{ steps.deployment.outputs.page_url }}
```

The `id-token: write` permission is required because the deploy
action authenticates to Pages via OIDC; this is the same trust
model the JS template's npm publish job uses for npm OIDC.

## 2. SPA + GitHub Pages

GitHub Pages serves static files only. For a Single-Page App with
a client-side router, deep links (e.g. `/operator`) would otherwise
hit GitHub's default 404 page. The standard workaround is to ship
a `404.html` that is **a copy of `index.html`** so the SPA boots
on the deep-link path and its router can take over.

Reference implementation: <https://github.com/rafgraph/spa-github-pages>

`meta-sovereign` already keeps client-side state in React component
state (no `react-router` yet), so deep links currently round-trip
to the same page. We still ship the `404.html` fallback so that any
future router change does not regress this behaviour.

## 3. `.nojekyll`

GitHub Pages runs Jekyll by default and ignores files starting with
`_` (e.g. `_app.js`). The standard escape hatch is an empty
`.nojekyll` file at the artifact root. Source:
<https://github.blog/2009-12-29-bypassing-jekyll-on-github-pages/>

## 4. Web App Manifest and "Add to home screen"

A minimal `manifest.webmanifest` lets Chromium-based browsers
(desktop and Android) prompt the user to install the SPA as a PWA.
Required fields per W3C Web App Manifest:
<https://www.w3.org/TR/appmanifest/#installable-manifests>

```json
{
  "name": "meta-sovereign",
  "short_name": "meta-sovereign",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#0b0d12",
  "theme_color": "#0b0d12"
}
```

iOS supports the install flow but ignores most manifest fields and
uses the `apple-touch-icon` link in `index.html` instead. We add
the link in the build helper, not in the source `index.html`, so
the source file stays as-is for the local-server case.

## 5. Local-first / offline-first patterns

The "open the web app from any URL, talk to a local backend if you
have one" pattern is documented in the Local-First essay:
<https://www.inkandswitch.com/essay/local-first/>

The same essay names the trade-off explicitly: the web app is the
discovery surface; the local backend is where the user's data
actually lives. `meta-sovereign`'s `OfflineClient` already
implements this contract.

Reference apps that ship the same shape:

- **Excalidraw** — browser-first, ships from a static CDN, no
  backend required. Source: <https://github.com/excalidraw/excalidraw>
- **tldraw** — browser-first, multi-user via WebRTC, offline-first.
  Source: <https://github.com/tldraw/tldraw>
- **Logseq web demo** — reads/writes to a user-chosen local backend.
  Source: <https://github.com/logseq/logseq>
- **VS Code for the web** (`vscode.dev`) — runs in any modern
  browser, optionally attaches to a local CLI for full features.
  This is the closest reference for the "Pages SPA + local server"
  flow `meta-sovereign` aims for.

## 6. Discovery from a static origin to a local server

The browser cannot freely scan a LAN. The viable patterns are:

1. **Same origin** — only works if the SPA is served by the local
   server itself. Already handled in `discoverServer`.
2. **`localhost` / `127.0.0.1` probes** — works because browsers
   permit cross-origin requests to `127.0.0.1` from any origin
   (modulo the "Private Network Access" CORS preflight that
   Chromium-based browsers added in 2023). The local server must
   answer the preflight with `Access-Control-Allow-Private-Network: true`.
   Reference: <https://wicg.github.io/private-network-access/>
3. **User-supplied override** — `metaServer` localStorage entry
   already supported by `discoverServer`. The SPA prompts the user
   if the probe list returns nothing.
4. **WebRTC signalling against a public broker** — the existing
   `/rtc` endpoint on both servers, plus a TURN fallback documented
   in `docs/WEBRTC-TURN.md`.

The Pages workflow does **not** enable Private Network Access
preflight handling on its own — that is a property of the local
server. The Rust server in `crates/meta-sovereign-server` and the JS
server in `src/server/` both already permit any origin (`*`) on the
status endpoint, which is the only one used by `discoverServer`.

## 7. CI/CD best practices we already follow

The four AI-driven-development pipeline templates listed in the
issue all converge on the same `release.yml` shape:

- Fast checks first (syntax, lint, format, secret scan, file size,
  changeset validation, version-modification check).
- Slow checks (test matrix, doc build, broken-link check) only run
  after fast checks pass.
- Per-job `timeout-minutes` to fail fast on hangs.
- Concurrency groups that cancel older runs on `main` and queue
  PR runs.
- Changesets-driven release with OIDC trusted publishing.

`meta-sovereign`'s `release.yml` already implements every one of
these. The CI/CD comparison file in this folder enumerates the
file-by-file parity.

## 8. Documentation patterns for browser-first apps

The README pattern that converts best for browser-first apps is the
"hero URL → 30-second install → 5-minute power-user setup" shape:

1. **Hero URL** at the top, optionally with a screenshot.
2. **30-second install** — single command for the recommended
   server.
3. **5-minute power-user setup** — alternative servers, mobile,
   desktop.
4. **Developer reference** below the user-facing sections.

Reference READMEs that follow this shape:

- Excalidraw — <https://github.com/excalidraw/excalidraw#readme>
- tldraw — <https://github.com/tldraw/tldraw#readme>
- Logseq — <https://github.com/logseq/logseq#readme>

We adopt this shape verbatim for `meta-sovereign`'s README rework
in this PR.
