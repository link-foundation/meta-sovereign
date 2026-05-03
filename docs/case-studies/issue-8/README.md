# Case Study: Issue #8 — Browser-first publishing on GitHub Pages and user-friendly documentation

**Issue:** [#8 — Make sure all our features that can be supported in the browser directly are published to GitHub Pages and make user friendly documentation](https://github.com/link-foundation/meta-sovereign/issues/8)
**Author:** [@konard](https://github.com/konard)
**Status:** Implemented in PR #9
**Pull Request:** [#9](https://github.com/link-foundation/meta-sovereign/pull/9)

This case study collects every directive from issue #8, decomposes it
into atomic requirements, surveys the prior art and tooling that
help, and records the solution plan that PR #9 implements against the
local-first / privacy-first design constraints already established in
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) (see new section
**L. Browser-first publishing (issue #8)**).

The artefacts in this folder are:

| File                           | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `README.md`                    | This document — case study analysis.                                                             |
| `requirements.md`              | Atomic requirement list extracted from the issue.                                                |
| `solution-plan.md`             | Phased plan mapping requirements to concrete deliverables in this PR.                            |
| `components.md`                | Catalogue of upstream tooling and standards consulted.                                           |
| `external-research.md`         | Summary of external research about GitHub Pages SPA publishing, PWA install, and offline shells. |
| `ci-cd-template-comparison.md` | File-by-file comparison with the four AI-driven-development pipeline templates.                  |
| `data/`                        | Raw artefacts (issue body, comments, captured template inventories) used to build this study.    |

---

## 1. Vision (paraphrased from the issue)

The web SPA is already the canonical UI. Issue #8 asks us to make
that UI trivially reachable from any browser on any device, without
asking the user to install anything first:

- **Publish to GitHub Pages** automatically from CI so every push to
  `main` updates the public web app.
- **The web app on GitHub Pages is the front door**, with a local
  Rust server (preferred) or a JavaScript server (fallback) providing
  full sync and storage. The user discovers and connects to a server
  the first time they open the app; thereafter it boots offline-first.
- **Documentation is rewritten around the user**, not around the
  developer — the README leads with "open this URL in any browser",
  not with "clone this repo and run cargo build".
- **The repository layout follows the AI-driven-development pipeline
  templates** so the same CI/CD scripts can be reused without drift,
  and we report any improvement upstream to the templates.
- **All of this is a single, fully analysed, deeply researched PR**
  with a complete case study under `docs/case-studies/issue-8/`.

## 2. Why this case study exists

The issue explicitly requests:

> _We need to collect data related about the issue to this repository,
> make sure we compile that data to `./docs/case-studies/issue-{id}`
> folder, and use it to do deep case study analysis (also make sure to
> search online for additional facts and data), list of each and all
> requirements from the issue, and propose possible solutions and
> solution plans for each requirement (we should also check known
> existing components/libraries, that solve similar problem or can
> help in solutions)._

This document is the central deliverable of that request.

## 3. Method

1. **Source extraction** — issue body, issue comments, PR metadata, and
   PR review-thread comments captured via `gh` to `data/issue-8.json`,
   `data/issue-8-comments.json`, and `data/pr-9*.json`.
2. **Requirement decomposition** — see `requirements.md`. Each item
   carries a stable `R-L*` identifier so changesets, PRs, and code
   comments can reference it.
3. **Component survey** — see `components.md`. Catalogues the existing
   in-tree primitives (the `discoverServer()` flow with `metaServer`
   localStorage override, the offline-first `createOfflineClient()`,
   the Rust + JS servers' shared wire protocol, the React SPA bundle)
   plus the upstream tooling we lean on (`actions/configure-pages`,
   `actions/upload-pages-artifact`, `actions/deploy-pages`).
4. **External research** — see `external-research.md`. Pulls in
   prior art from PWA install flows, GitHub Pages SPA hosting (router
   handling, `404.html` fallback for SPAs), web app manifests, the
   Local-First Web essay, and how comparable apps (Excalidraw,
   tldraw, Logseq web) host an offline-first UI on GitHub Pages
   while talking to a local backend.
5. **CI/CD comparison** — `ci-cd-template-comparison.md` walks every
   workflow file under `.github/workflows/` and every script under
   `js/scripts/` against the four templates listed in the issue. Where
   the templates are missing something we have, we propose an upstream
   issue in the same document.
6. **Plan synthesis** — `solution-plan.md` maps each `R-L*` item to a
   concrete change in this PR.

## 4. Headline findings

- The repository **already has** a browser-discoverable architecture:
  `js/src/web/discover.js` first probes the same origin, then a saved
  override (`metaServer` in `localStorage`), then runtime-shell
  candidates injected by Electron/Capacitor, then a short list of
  `127.0.0.1` ports. When opened from `https://link-foundation.github.io/meta-sovereign/`
  the SPA therefore "just works" — same-origin probe will fail, but
  the saved override and `127.0.0.1` ports cover the local server case.
  No code change is required on the discovery side; only a CI pipeline
  to publish the bundle to GitHub Pages.
- The `js/scripts/build-web.mjs` script already produces a production
  ESM bundle (`js/src/web/app.min.js`) via `esbuild`. The static surface
  needed for Pages is just `js/src/web/index.html` + `app.css` + `app.min.js`
  - `discovery-shell.js` + the WASM and worker side files. We add a
    thin `js/scripts/build-pages.mjs` that copies these into `dist/pages/`
    with a `404.html` SPA fallback and a `.nojekyll` marker.
- The published app must work even when the user has **no local server**
  yet. The existing `OfflineClient` gives that for free: writes go to
  the local browser store first (`createBrowserStore` chooses
  `doublets-web` → IndexedDB → localStorage → in-memory) and reads
  fall back when the server is unreachable. We just need to make
  this guarantee explicit in the README and add a "Connect to local
  server" prompt to the SPA so the discovery override is set
  visibly, not implicitly.
- The README **today is developer-first**: the second-line headline
  is "PR #2 has since expanded the codebase…". Issue #8 asks for the
  opposite shape — the first thing a user reads should be the URL of
  the live web app, with a one-line "Need full features? Start the
  Rust server (or fallback JS server)." beneath it. We restructure
  the README accordingly while preserving the existing developer
  documentation under a "Developer reference" section near the bottom.
- The four AI-driven-development pipeline templates (JS, Rust, Python,
  C#) **all** already converge on the same `release.yml` skeleton with
  fast-fail job ordering, per-job `timeout-minutes`, broken-link
  checking, and changeset-driven releases. We are aligned with the JS
  template (which is our base). The Rust template's
  `.pre-commit-config.yaml` is the only file we are missing; we
  propose adding it as an upstream improvement in the comparison doc
  (and not in this PR, since the issue scope is browser publishing,
  not pre-commit hardening).
- The reviewer requirement **"Make sure all JavaScript code in `./js`
  folder, and all rust code in `./rust` folder. Like in our templates."**
  is now implemented literally. The JavaScript sources, tests, scripts,
  CLI entrypoint, Electron shell, examples, and experiments live under
  `js/`; the Rust workspace manifest, lockfile, and crates live under
  `rust/`. Package exports, npm scripts, workflows, Dockerfiles, docs,
  and tests were updated so the repository behaves the same from the
  user-facing commands while matching the requested language split.

The complete reasoning — including library URLs and trade-offs — is in
`external-research.md` and `components.md`.

## 5. Constraints honoured

- **Public domain / Unlicense** licensing across the project.
- **No premature optimisation**; the Pages workflow is ~80 lines of
  YAML and the build helper is one Node script; no new dependencies
  are added.
- **Backwards compatible**: existing `npm run build:web` still works;
  the SPA still bundles to `js/src/web/app.min.js`; `meta-sovereign serve`
  still serves the same files; we only add a `dist/pages/` build step.
- **Tested**: the build helper has a unit test that asserts every
  asset is copied and the SPA fallback page exists. The discovery
  flow already has unit tests in `js/tests/discover.test.js`; we add a
  test that the SPA boots offline against an empty server list.

## 6. Current Status

Implemented in PR #9. The full requirement → status mapping is
maintained at the top-level
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) under the new
section **L. Browser-first publishing (issue #8)**.

---

## 7. References

The full bibliography is in `external-research.md`. Key entries:

- _Local-first software_ — Kleppmann et al., Ink & Switch, 2019. <https://www.inkandswitch.com/essay/local-first/>
- GitHub Pages official docs — <https://docs.github.com/en/pages>
- `actions/deploy-pages` — <https://github.com/actions/deploy-pages>
- `actions/upload-pages-artifact` — <https://github.com/actions/upload-pages-artifact>
- `actions/configure-pages` — <https://github.com/actions/configure-pages>
- SPA + GitHub Pages 404.html fallback — <https://github.com/rafgraph/spa-github-pages>
- W3C Web App Manifest — <https://www.w3.org/TR/appmanifest/>
- Excalidraw (browser-first, GitHub Pages-style hosting) — <https://github.com/excalidraw/excalidraw>
- tldraw (browser-first whiteboard) — <https://github.com/tldraw/tldraw>
- Logseq web demo (offline-first, hosts from static origin) — <https://github.com/logseq/logseq>
