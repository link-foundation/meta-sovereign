# Issue #8 — Components and tooling survey

This document catalogues the upstream tooling and standards we lean
on for browser-first publishing, plus the in-tree primitives we
already have.

## In-tree primitives (already implemented)

| Component                                                                  | Role                                                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/web/index.html`                                                       | The SPA shell. Already serves as the entry point for both the local server and any static host.                                                |
| `src/web/app.js` / `app.min.js`                                            | The React SPA bundle. Built by `scripts/build-web.mjs` (esbuild).                                                                              |
| `src/web/discover.js` (`discoverServer`)                                   | Probes same-origin → saved override (`metaServer` localStorage) → runtime shell candidates → 127.0.0.1 ports → caller-supplied LAN candidates. |
| `src/web/client.js` (`createOfflineClient`)                                | Offline-first client: writes go to local store first; server is best-effort.                                                                   |
| `src/storage/browser-store.js` (`createBrowserStore`, `pickBrowserDriver`) | Browser storage abstraction over `doublets-web` → IndexedDB → localStorage → in-memory.                                                        |
| `src/server/index.js`                                                      | The JS server (Node/Bun/Deno).                                                                                                                 |
| `crates/meta-sovereign-server/`                                            | The pure-Rust server (R-G2).                                                                                                                   |
| `scripts/build-web.mjs`                                                    | Production esbuild bundle.                                                                                                                     |
| `scripts/build-mobile.mjs`                                                 | Capacitor mobile bundle (reuses the web bundle).                                                                                               |
| `electron/main.js`                                                         | Electron desktop shell that opens the same SPA.                                                                                                |
| `mobile/` + `capacitor.config.json`                                        | Capacitor mobile shell that loads the same bundle.                                                                                             |
| `docs/UI-DESIGN-AUDIT.md`                                                  | Apple HIG / Google Material / Microsoft Fluent compliance audit (R-H1).                                                                        |

## New primitives added in this PR

| Component                     | Role                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build-pages.mjs`     | Copies `src/web/*` to `dist/pages/`, writes `.nojekyll` and a `404.html` SPA fallback, generates a `manifest.webmanifest`, and links it. |
| `.github/workflows/pages.yml` | GitHub Actions workflow that builds and deploys the bundle to GitHub Pages on push to `main` and `workflow_dispatch`, build-only on PRs. |
| `tests/build-pages.test.js`   | Unit test that runs the helper into a temp dir and asserts every required file is present.                                               |
| `docs/USER-GUIDE.md`          | The long-form user-facing guide.                                                                                                         |
| `docs/SERVER-PARITY.md`       | Route-by-route parity matrix between the JS and Rust servers.                                                                            |
| `docs/case-studies/issue-8/`  | This case study.                                                                                                                         |

## Upstream tooling

| Tool                            | Version | Role                                                                                                                  |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`              | v6      | Standard checkout action. Already used by `release.yml`.                                                              |
| `actions/setup-node`            | v6      | Node toolchain for the build step. Already used by `release.yml`.                                                     |
| `actions/configure-pages`       | v5      | Sets the Pages site origin and writes the deployment metadata.                                                        |
| `actions/upload-pages-artifact` | v3      | Uploads the `dist/pages/` directory as the Pages artifact.                                                            |
| `actions/deploy-pages`          | v4      | Deploys the artifact and reports the deployment URL back to the workflow.                                             |
| `esbuild`                       | ^0.28   | Already in `package.json` devDependencies; powers `scripts/build-web.mjs` and is reused by `scripts/build-pages.mjs`. |

All four `actions/*-pages*` actions are first-party (the `actions/`
org) and follow the same release cadence as the rest of the
GitHub-hosted runners. They are the GitHub-recommended path since
GitHub Pages migrated off the legacy `gh-pages` branch deploy in 2022.

## Standards

| Standard                  | Why it matters                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3C Web App Manifest      | Drives "Install app" prompts in Chromium-based browsers and the iOS / Android home-screen install flow. Generated as `manifest.webmanifest` by `scripts/build-pages.mjs`. |
| WHATWG Service Worker     | Optional. Not required for v1: the local server is the canonical persistence layer. Tracked as a follow-up in the case study.                                             |
| RFC 8615 — `.well-known/` | Future option for advertising server-discovery candidates from the Pages origin. Not used in v1.                                                                          |
| WCAG 2.0 A/AA             | Already audited by `tests/e2e-browser-spa.mjs` via axe-core (R-H1). The Pages bundle inherits this guarantee verbatim.                                                    |

## Reference apps that ship the same shape

| App                                    | Shape                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Excalidraw**                         | Browser-first; OSS; React; ships from the same static origin as the desktop builds; offline-capable via service worker. Reference for the user-flow narrative. |
| **tldraw**                             | Browser-first; OSS; offline-first; multi-user via WebRTC. Closest reference for the WebRTC sync we already implement (R-F5).                                   |
| **Logseq web demo**                    | Browser-first; OSS; reads/writes to a user-chosen local backend (the desktop app or a SQLite-WASM database).                                                   |
| **VS Code for the web (`vscode.dev`)** | Browser-first; reaches into a local CLI for full features; clean fallback when the local helper isn't installed.                                               |

These apps are the precedent for the "open this URL, optionally
attach a local backend" UX. None of them require the user to
install anything before they see a working UI; all of them surface
an unobtrusive prompt to attach a more powerful local backend.
This is exactly the shape `meta-sovereign` already has thanks to
`OfflineClient` + `discoverServer` — issue #8 is the publishing
step that makes it visible to non-developers.
