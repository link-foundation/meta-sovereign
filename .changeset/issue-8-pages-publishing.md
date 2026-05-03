---
'meta-sovereign': minor
---

R-L1..R-L15: Browser-first publishing on GitHub Pages, user-friendly
documentation rework, and CI/CD parity audit.

- New `scripts/build-pages.mjs` builds the `dist/pages/` artifact from
  `src/web/` (writes `404.html`, `.nojekyll`, `manifest.webmanifest`,
  injects the manifest link into a copy of `index.html`).
- New `.github/workflows/pages.yml` deploys the artifact via the
  official `actions/configure-pages@v5`,
  `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`
  on push to `main` and via `workflow_dispatch`. `pull_request` runs
  build-only. Both jobs cap at `timeout-minutes: 10`.
- `README.md` is rewritten user-first: "Try it now" → "Run a local
  server" (Rust preferred, JS fallback) → "Connect the SPA to your
  server"; the developer reference moves below an explicit divider.
- New `docs/USER-GUIDE.md` collects the user-facing flows.
- New `docs/SERVER-PARITY.md` documents 32/38 routes parity between
  the JS server and Rust server.
- New `docs/case-studies/issue-8/` with `README.md`, `requirements.md`,
  `solution-plan.md`, `components.md`, `external-research.md`,
  `ci-cd-template-comparison.md`, and raw issue/comment/template-inventory
  payloads under `data/`.
- New section **L. Browser-first publishing (issue #8)** in
  `docs/REQUIREMENTS.md`.
- New `tests/build-pages.test.js` unit-tests the build helper.
