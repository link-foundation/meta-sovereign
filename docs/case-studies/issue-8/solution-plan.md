# Issue #8 — Phased Solution Plan

This plan maps each `R-L*` requirement from `requirements.md` to a
concrete change delivered in PR #9.

The phases are ordered to keep CI green at every commit:

1. Add the case study (this folder) and the requirement IDs to
   `docs/REQUIREMENTS.md`.
2. Add the GitHub Pages build helper and Pages workflow.
3. Rework the README to be UI-first.
4. Add the Rust ↔ JS server parity matrix.
5. Add the CI/CD template comparison and any upstream proposals.

## Phase 1 — Case study and requirement table (R-L13, R-L13a..c, R-L14, R-L15)

- New folder `docs/case-studies/issue-8/` containing this plan plus
  `README.md`, `requirements.md`, `components.md`,
  `external-research.md`, `ci-cd-template-comparison.md`, `data/`.
- New section **L. Browser-first publishing (issue #8)** appended to
  `docs/REQUIREMENTS.md`, with one row per `R-L*` ID and a status
  column.
- A changeset file under `.changeset/` describing the change so the
  release pipeline picks it up at the next version bump.

## Phase 2 — GitHub Pages publishing (R-L1..R-L5, R-L3a..d, R-L4a..c)

- New script `js/scripts/build-pages.mjs`:
  - Runs `npm run build:web` first (idempotent) so `app.min.js` is up
    to date.
  - Creates `dist/pages/` and copies every static asset from
    `js/src/web/` (`index.html`, `app.css`, `app.min.js`,
    `discovery-shell.js`, `pattern-worker.js`, `patterns-wasm.js`,
    `pattern-matcher.wasm`, `views.js`, `dom.js`, `client.js`,
    `discover.js`, `webrtc-sync.js`).
  - Writes a `.nojekyll` file at the root so files starting with `_`
    serve verbatim, and a `404.html` that is a copy of `index.html`
    so SPA deep links work on Pages.
  - Writes a small `manifest.webmanifest` and links it from
    `index.html` via a generated `<link rel="manifest">` tag (the
    helper edits a copy in `dist/pages/`, never the source file).
- New workflow `.github/workflows/pages.yml`:
  - Triggers on push to `main`, `pull_request` (build-only, no
    deploy), and `workflow_dispatch`.
  - Two jobs: `build` and `deploy`. `deploy` runs only on
    `main` / `workflow_dispatch` and depends on `build`.
  - Uses `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`,
    `actions/deploy-pages@v4`.
  - Declares `permissions: { contents: read, pages: write, id-token: write }`
    and the `github-pages` environment, both required by
    `actions/deploy-pages`.
  - Caps each job with an explicit `timeout-minutes` (`10`), matching
    the policy in `release.yml`.
- New unit test `js/tests/build-pages.test.js` that runs the helper
  against a temp dir and asserts every required file is present.

## Phase 3 — README and docs rework (R-L6, R-L7, R-L8, R-L8b, R-L5a, R-L5b, R-L6a)

- New section "Try it now" at the top of `README.md` linking to the
  GitHub Pages URL with a single screenshot from `docs/screenshots/`.
- New section "Run a local server" presenting the **Rust server first
  (preferred)** then the **JS server (fallback)**, each as a
  copy-pasteable one-liner. The existing developer "Quick Start"
  block moves into a "Developer reference" section near the bottom,
  unchanged.
- New section "Connect the SPA to your server" explaining the
  `metaServer` localStorage override and the in-app server settings
  prompt.
- New page `docs/USER-GUIDE.md` collecting the user-facing flows in
  one place: install nothing, install Rust server, install JS server,
  install desktop / mobile app. The README links here for the long
  form.

## Phase 4 — Rust ↔ JS server parity (R-L9, R-L8a, R-L9a)

- New page `docs/SERVER-PARITY.md` enumerating every route in both
  servers (sourced from `rust/crates/meta-sovereign-server/src/routes.rs`
  and `js/src/server/index.js` / `routes-*.js`) with a parity column.
  Where the two diverge, the doc states the intent (e.g. some optional
  metrics endpoints might be Rust-only or JS-only).
- The `R-L9` row in `docs/REQUIREMENTS.md` references this page and
  is marked Done once the table is filled in and the existing
  `js/tests/server-iter3.test.js` cross-runs against both servers.

## Phase 5 — CI/CD template comparison (R-L12, R-L12a, R-L12b)

- New page `docs/case-studies/issue-8/ci-cd-template-comparison.md`
  walking each workflow and each script in this repo against the
  four templates listed in the issue, marking each as:
  - **Parity** — present and identical-by-intent.
  - **Intentional drift** — present but customised for
    `meta-sovereign` (e.g. `.mjs` syntax check is JS-template-only).
  - **Upstream gap** — the templates are missing something that this
    repo or its sibling templates already do; we propose filing an
    upstream issue.
- `data/template-inventory.json` captures the file lists from each
  template's `.github/workflows/` and `js/scripts/` directories at the
  time of writing (raw JSON dump from `gh api`).
- The proposed upstream issues are listed at the end of the
  comparison doc as ready-to-paste issue bodies.

## Phase 6 — Repository layout (R-L10, R-L10a, R-L11)

- Move all JavaScript-owned code and tooling into `js/`: sources,
  tests, scripts, CLI entrypoint, Electron shell, examples,
  experiments, and the ESLint config.
- Move the Rust workspace into `rust/`: `rust/Cargo.toml`,
  `rust/Cargo.lock`, and `rust/crates/`.
- Update the npm exports map, `bin` entry, package scripts, GitHub
  Actions, Dockerfiles, Deno config, README, user guide, and tests so
  user-facing commands continue to work from the repository root.
- Keep internal relative imports stable by moving related JS folders
  together; keep Rust workspace members relative to `rust/Cargo.toml`.

## Phase 7 — PR finalisation (R-L14, R-L15)

- Single PR (#9), all phases above committed in their own logical
  commits.
- PR description includes a checklist of `R-L*` IDs with a
  per-row status; reviewers can spot any incomplete row at a glance.
- CI must be green before requesting review.

---

## Per-requirement deliverable map

| ID     | Deliverable in PR #9                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-L1   | The deployed bundle exposes every browser-supportable feature already in `js/src/web/` (chat, operator, contacts, automation, patterns, replies, facts, audience, broadcast, …). |
| R-L2   | `pages.yml` workflow + `dist/pages/` artifact published to GitHub Pages.                                                                                                         |
| R-L3   | `pages.yml` triggers on push to `main`.                                                                                                                                          |
| R-L3a  | `pages.yml` uses `actions/configure-pages`, `upload-pages-artifact`, `deploy-pages`.                                                                                             |
| R-L3b  | `pages.yml` declares `pages: write`, `id-token: write`, and the `github-pages` environment.                                                                                      |
| R-L3c  | `pages.yml` includes `workflow_dispatch:`.                                                                                                                                       |
| R-L3d  | `pages.yml` sets `timeout-minutes: 10` on each job.                                                                                                                              |
| R-L4   | The static bundle is the same React SPA shipped with the desktop/mobile apps (electron + capacitor reuse `js/src/web/`).                                                         |
| R-L4a  | `js/scripts/build-pages.mjs` writes `404.html` as a copy of `index.html`.                                                                                                        |
| R-L4b  | `js/scripts/build-pages.mjs` writes `.nojekyll`.                                                                                                                                 |
| R-L4c  | Already covered by `OfflineClient` + `BrowserStore`; documented in `README.md` and tested in `js/tests/offline-client.test.js`.                                                  |
| R-L5   | The published URL is testable from any browser; a smoke-test step in `pages.yml` `curl`s the deployed `index.html` after deploy.                                                 |
| R-L5a  | README "Try it now" section links the live Pages URL.                                                                                                                            |
| R-L5b  | README "Connect the SPA to your server" section.                                                                                                                                 |
| R-L6   | README and `docs/USER-GUIDE.md` reworked to put the user flow first.                                                                                                             |
| R-L7   | README leads with UI flow + server startup commands.                                                                                                                             |
| R-L8   | README "Run a local server" section presents Rust first, JS fallback.                                                                                                            |
| R-L8a  | Already in tree (`rust/crates/meta-sovereign-server`, R-G2).                                                                                                                     |
| R-L8b  | README documents both `cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server` and `meta-sovereign serve`.                                                           |
| R-L9   | `docs/SERVER-PARITY.md` route-by-route matrix.                                                                                                                                   |
| R-L9a  | Same as R-L9.                                                                                                                                                                    |
| R-L10  | All JavaScript code and JS tooling live under `js/` (`js/src`, `js/tests`, `js/scripts`, `js/bin`, `js/electron`, `js/examples`, `js/experiments`).                              |
| R-L10a | README "Repository structure" mini-doc documents the new `js/` layout.                                                                                                           |
| R-L11  | The Rust workspace lives under `rust/` (`rust/Cargo.toml`, `rust/Cargo.lock`, `rust/crates`).                                                                                    |
| R-L12  | `ci-cd-template-comparison.md` walks every workflow and script.                                                                                                                  |
| R-L12a | Comparison covers `release.yml`, `links.yml`, `pages.yml`, every `js/scripts/*.mjs` and `js/scripts/*.sh`.                                                                       |
| R-L12b | Upstream proposals listed at the end of the comparison doc.                                                                                                                      |
| R-L13  | This folder.                                                                                                                                                                     |
| R-L13a | `data/issue-8.json`, `data/issue-8-comments.json`, and the `data/pr-9*.json` PR review payloads.                                                                                 |
| R-L13b | This file.                                                                                                                                                                       |
| R-L13c | `components.md`, `external-research.md`.                                                                                                                                         |
| R-L14  | One PR (#9), one branch (`issue-8-c22927792fe8`).                                                                                                                                |
| R-L15  | All `R-L*` rows above are addressed; the PR description tracks them.                                                                                                             |
