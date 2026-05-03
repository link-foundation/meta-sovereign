# Issue #8 — Atomic Requirements (R-L\* family)

Each item below is an atomic, testable requirement extracted from
[issue #8](https://github.com/link-foundation/meta-sovereign/issues/8).
The `R-L*` identifiers slot into the master requirement table at
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) under section
**L. Browser-first publishing (issue #8)**.

The issue body is preserved verbatim in `data/issue-8.json`.

## L. Browser-first publishing

| ID    | Requirement                                                                                                                                                | Source phrase                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| R-L1  | All browser-supportable features must be reachable from a public web app.                                                                                  | "all our features, that can be supported in the browser directly are published"                                                  |
| R-L2  | The public web app must be hosted on GitHub Pages.                                                                                                         | "published to GitHub Pages"                                                                                                      |
| R-L3  | Publishing to GitHub Pages must happen automatically via GitHub Actions on every push to the default branch.                                               | "automatic GitHub Pages publish via Actions"                                                                                     |
| R-L4  | The published web client must behave similarly to the mobile and desktop apps (same UI, same offline-first contract).                                      | "web client that is also similar to mobile/desktop apps"                                                                         |
| R-L5  | The whole flow must be checkable and testable directly from the web browser.                                                                               | "easy to check and test right from the web browser"                                                                              |
| R-L6  | The README and documentation must be reworked to be as user-friendly as possible.                                                                          | "rework our README.md and docs, and make sure we are user friendly as we can be"                                                 |
| R-L7  | The README must focus on UI-based + server startup flows that are easy for the user.                                                                       | "README.md should focus on UI-based + server startup flows that are as easy for user as possible"                                |
| R-L8  | The easiest user flow is: open the GitHub Pages web app + start a local Rust server, with a JS server fallback.                                            | "user our web app on GitHub Pages + local rust server (double check it has all the features) with fallback to JavaScript server" |
| R-L9  | Verify that the Rust server has all the features the JS server has.                                                                                        | "double check it has all the features"                                                                                           |
| R-L10 | All JavaScript code lives in a JS-only tree (the templates' single-language layout).                                                                       | "Make sure all JavaScript code in ./js folder … Like in our templates"                                                           |
| R-L11 | All Rust code lives in a Rust-only tree (the templates' single-language layout).                                                                           | "all rust code in ./rust folder. Like in our templates"                                                                          |
| R-L12 | Apply CI/CD best practices from the four AI-driven-development pipeline templates (JS, Rust, Python, C#) and report any gap upstream as a templates issue. | "Use all the best practices from CI/CD templates … if the same issue is found in template report issue also in templates"        |
| R-L13 | Compile a deep case study at `docs/case-studies/issue-8/` covering requirements, solution plan, components survey, external research, and raw issue data.  | "compile that data to ./docs/case-studies/issue-{id} folder, and use it to do deep case study analysis …"                        |
| R-L14 | Plan and execute everything in a single pull request.                                                                                                      | "plan and execute everything in a single pull request"                                                                           |
| R-L15 | Continue iterating until every requirement is fully addressed.                                                                                             | "until it is each and every requirement fully addressed, and everything is totally done"                                         |

### Sub-requirements derived during analysis

These are the implementation-level facets we identified while writing
the solution plan. They are still tagged `R-L*` for traceability.

| ID     | Requirement                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-L3a  | The Pages workflow must use the official `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` actions (the supported path since 2022).   |
| R-L3b  | The Pages workflow must declare `permissions: pages: write, id-token: write` and use the `github-pages` environment, as required by `actions/deploy-pages`.                |
| R-L3c  | The Pages workflow must publish on every push to `main` and be manually re-runnable via `workflow_dispatch`.                                                               |
| R-L3d  | The Pages workflow must declare a `timeout-minutes` cap, in line with the existing `release.yml` and `links.yml` policy.                                                   |
| R-L4a  | The deployed bundle must include a `404.html` SPA fallback so deep-linked routes (e.g. `/operator`) resolve to the SPA shell instead of GitHub's default 404 page.         |
| R-L4b  | The deployed bundle must include a `.nojekyll` marker so files starting with `_` are served verbatim.                                                                      |
| R-L4c  | The SPA must default to a usable, write-capable, fully offline experience when no server is reachable (already provided by `OfflineClient` + `BrowserStore`).              |
| R-L5a  | The README must include the public Pages URL prominently (above the "Status" section).                                                                                     |
| R-L5b  | The README must include a "Connect to your local server" recipe that mirrors what the SPA itself prompts.                                                                  |
| R-L6a  | The README must lead with the user-facing flow (open URL → optional local server) before the developer-facing flow (clone → bun install).                                  |
| R-L8a  | The Rust server must ship a `meta-sovereign-rs serve` binary that listens on the same wire protocol as the JS server (already true; covered by `R-G2`).                    |
| R-L8b  | The README must document both server commands side-by-side (Rust preferred, JS fallback).                                                                                  |
| R-L9a  | A documented feature parity matrix must compare the JS server and the Rust server route-by-route.                                                                          |
| R-L10a | The repository structure should be documented and matched to the templates: per-language separation already exists (`src/` for JS, `crates/` for Rust workspace).          |
| R-L12a | The CI/CD comparison must enumerate every workflow file and every script in `.github/workflows/` and `scripts/`, and mark each as parity, intentionally-different, or gap. |
| R-L12b | Any gap that the templates themselves have must surface as a recommendation in the comparison doc, ready to be filed as an upstream issue.                                 |
| R-L13a | The case study must include the raw issue body and comment payloads under `data/`.                                                                                         |
| R-L13b | The case study must include a `solution-plan.md` mapping each `R-L*` requirement to a concrete deliverable in this PR.                                                     |
| R-L13c | The case study must include a `components.md` and `external-research.md` per the established case-study template (see issue-1, issue-6).                                   |
