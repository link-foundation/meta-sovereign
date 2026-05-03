# Issue #8 — CI/CD comparison with the AI-driven-development pipeline templates

This document compares every workflow file under `.github/workflows/`
and every script under `scripts/` in `meta-sovereign` against the
four templates listed in the issue:

- [`link-foundation/js-ai-driven-development-pipeline-template`](https://github.com/link-foundation/js-ai-driven-development-pipeline-template)
- [`link-foundation/rust-ai-driven-development-pipeline-template`](https://github.com/link-foundation/rust-ai-driven-development-pipeline-template)
- [`link-foundation/python-ai-driven-development-pipeline-template`](https://github.com/link-foundation/python-ai-driven-development-pipeline-template)
- [`link-foundation/csharp-ai-driven-development-pipeline-template`](https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template)

The raw inventories live in `data/template-inventory.json`. The
classification used below:

- **Parity** — present in this repo and identical-by-intent.
- **Intentional drift** — present but customised because the repo
  is multi-language (JS + Rust workspace + WebRTC + Electron + mobile + WASM)
  rather than a single-language template.
- **New (this PR)** — added by issue #8.
- **Upstream gap** — the templates are missing something that this
  repo or a sibling template already does; we propose filing an
  upstream issue.

## 1. Workflows

| File          | meta-sovereign  | JS template | Rust template | Python template | C# template | Status                                 |
| ------------- | --------------- | ----------- | ------------- | --------------- | ----------- | -------------------------------------- |
| `release.yml` | yes (659 lines) | yes         | yes           | yes             | yes         | Parity (forked from JS, then extended) |
| `links.yml`   | yes             | yes         | no            | no              | no          | Parity with JS template                |
| `pages.yml`   | **new**         | no          | no            | no              | no          | New (this PR) — see Upstream gap #1    |

### `release.yml` — parity highlights

Both `meta-sovereign`'s `release.yml` and the JS template's already
implement, in the same shape:

- Fast-fail job ordering (syntax → lint → format → secretlint → file
  size → version check → changeset check → docs validation, then
  test matrix, then docs build, then release).
- Per-job `timeout-minutes` (5–30 min depending on job).
- Concurrency groups: `cancel-in-progress` only on `main`.
- Changesets-driven release with OIDC trusted publishing.
- Manual `workflow_dispatch` with `instant` and `changeset-pr`
  modes.

`meta-sovereign` extends the template with:

- A Rust workspace test job (`cargo test --workspace`) that the JS
  template does not have.
- A `cargo doc --no-deps --workspace` step in the API docs job.
- A real-browser e2e job (opt-in via `RUN_BROWSER_E2E=1`).

### `links.yml` — parity

Identical to the JS template version, including the Web Archive
fallback step (`scripts/check-web-archive.mjs`) and the
`docs/case-studies` exclusion.

### `pages.yml` — new in this PR

Not present in any of the four templates. Provides the
issue-#8-mandated GitHub Pages publish.

## 2. Scripts

The JS template ships 22 scripts. `meta-sovereign` ships 30 scripts
(every JS-template script plus repo-specific ones):

| Script                             | meta-sovereign | JS template | Notes                                                                                         |
| ---------------------------------- | -------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `changeset-version.mjs`            | yes            | yes         | Parity                                                                                        |
| `check-changesets.mjs`             | yes            | yes         | Parity                                                                                        |
| `check-file-line-limits.sh`        | yes            | yes         | Parity                                                                                        |
| `check-mjs-syntax.sh`              | yes            | yes         | Parity                                                                                        |
| `check-release-needed.mjs`         | yes            | yes         | Parity                                                                                        |
| `check-version.mjs`                | yes            | yes         | Parity                                                                                        |
| `check-web-archive.mjs`            | yes            | yes         | Parity                                                                                        |
| `create-github-release.mjs`        | yes            | yes         | Parity                                                                                        |
| `create-manual-changeset.mjs`      | yes            | yes         | Parity                                                                                        |
| `detect-code-changes.mjs`          | yes            | yes         | Parity                                                                                        |
| `format-github-release.mjs`        | yes            | yes         | Parity                                                                                        |
| `format-release-notes-helpers.mjs` | yes            | yes         | Parity                                                                                        |
| `format-release-notes.mjs`         | yes            | yes         | Parity                                                                                        |
| `instant-version-bump.mjs`         | yes            | yes         | Parity                                                                                        |
| `js-paths.mjs`                     | yes            | yes         | Parity                                                                                        |
| `merge-changesets.mjs`             | yes            | yes         | Parity                                                                                        |
| `package-info.mjs`                 | yes            | yes         | Parity (added by commit `36a4a4c` "Align CI/CD scripts with JS template")                     |
| `publish-to-npm.mjs`               | yes            | yes         | Parity                                                                                        |
| `setup-npm.mjs`                    | yes            | yes         | Parity                                                                                        |
| `simulate-fresh-merge.sh`          | yes            | yes         | Parity                                                                                        |
| `validate-changeset.mjs`           | yes            | yes         | Parity                                                                                        |
| `version-and-commit.mjs`           | yes            | yes         | Parity                                                                                        |
| `attach-api-docs.sh`               | yes            | no          | Repo-specific: attaches `npm run docs:api` + `cargo doc` output to GitHub Releases.           |
| `build-api-docs.mjs`               | yes            | no          | Repo-specific: drives `npm run docs:api` + `cargo doc`.                                       |
| `build-mobile.mjs`                 | yes            | no          | Repo-specific: Capacitor mobile bundle.                                                       |
| `build-pattern-wasm.sh`            | yes            | no          | Repo-specific: builds `pattern-matcher.wasm`.                                                 |
| `build-web.mjs`                    | yes            | no          | Repo-specific: production esbuild bundle for SPA.                                             |
| `build-pages.mjs`                  | **new**        | no          | New (this PR): copies `src/web/*` to `dist/pages/`, writes `404.html`, `.nojekyll`, manifest. |
| `mobile-platform.mjs`              | yes            | no          | Repo-specific: Capacitor `sync` / `ios open` / `android open`.                                |

## 3. Root-level files

| File                      | meta-sovereign | JS template | Rust template                          | Python template | C# template | Status                                                              |
| ------------------------- | -------------- | ----------- | -------------------------------------- | --------------- | ----------- | ------------------------------------------------------------------- |
| `.changeset/`             | yes            | yes         | no                                     | no              | yes         | Parity with JS / C# templates                                       |
| `.husky/`                 | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `.jscpd.json`             | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `.lycheeignore`           | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `.prettierignore`         | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `.prettierrc`             | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `.secretlintrc.json`      | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `eslint.config.js`        | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `bunfig.toml`             | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `deno.json`               | yes            | yes         | no                                     | no              | no          | Parity with JS template                                             |
| `Cargo.toml`              | yes            | no          | yes                                    | no              | no          | Parity with Rust template                                           |
| `Cargo.lock`              | yes            | no          | yes                                    | no              | no          | Parity with Rust template                                           |
| `.pre-commit-config.yaml` | **no**         | no          | yes                                    | yes             | yes         | Upstream gap #2 (JS template)                                       |
| `CONTRIBUTING.md`         | docs/          | no          | yes                                    | yes             | yes         | Intentional drift                                                   |
| `capacitor.config.json`   | yes            | no          | no                                     | no              | no          | Repo-specific (mobile)                                              |
| `docker/`                 | yes            | no          | no                                     | no              | no          | Repo-specific (microservices)                                       |
| `electron/`               | yes            | no          | no                                     | no              | no          | Repo-specific (desktop)                                             |
| `mobile/`                 | yes            | no          | no                                     | no              | no          | Repo-specific (mobile)                                              |
| `crates/`                 | yes            | no          | yes (`src/` for single-crate template) | no              | no          | Multi-crate workspace, intentional drift from single-crate template |

## 4. Upstream gaps and proposed issues

### Upstream gap #1 — All four templates are missing a Pages publish workflow

If any of the templates ship a frontend bundle (the JS template
already has `src/`-level JS that could be a SPA), users would benefit
from a copy of `pages.yml` under `.github/workflows/`. This is a
template enhancement, not a `meta-sovereign` issue.

**Proposed upstream issue body** (paste into
`link-foundation/js-ai-driven-development-pipeline-template`):

> _Add an opt-in GitHub Pages publishing workflow_
>
> Many downstream repositories ship a static frontend (SPA, docs,
> demo) that would benefit from automatic GitHub Pages deployment
> on push to `main`. We have such a workflow in
> `link-foundation/meta-sovereign/.github/workflows/pages.yml`
> (introduced in PR #9). Could we adopt the same shape here so
> downstreams inherit it for free? It uses the official
> `actions/configure-pages`, `actions/upload-pages-artifact`, and
> `actions/deploy-pages` actions.

### Upstream gap #2 — JS template is missing `.pre-commit-config.yaml`

The Rust, Python, and C# templates all ship a
`.pre-commit-config.yaml`. The JS template uses `.husky/` instead.
This is a deliberate JS-ecosystem choice (Husky is the JS-native
pre-commit hook framework), so it is **not** a gap; we record it
here for completeness.

### No other gaps detected

Every other `meta-sovereign` workflow and script is either present
in the JS template (parity) or repo-specific (multi-language, mobile,
electron, docker). No template-side regressions found.

## 5. Summary

`meta-sovereign` is in lock-step with the JS template for every
shared concern (release pipeline, link checking, lint/format,
secret scan, file size limits, changeset validation). The only
template-shaped change introduced by this PR is the new
`pages.yml`, which we recommend back-porting to the JS template
because it is generic enough to benefit any downstream that ships
a frontend bundle.
