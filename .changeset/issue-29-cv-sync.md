---
'meta-sovereign': minor
---

R-V1..R-V22, R-E11..R-E13: CV synchronisation across job platforms. A new
`js/src/cv/` subsystem reads, compares and updates the user's CV on
LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks, TopCV and superjob.ru
through a local [browser-commander](https://github.com/link-foundation/browser-commander)
session, with the canonical CV stored in links notation like every other
entity (`js/src/cv/model.js`, `diff.js`).

Each platform contributes a **declarative plan** — data, not code:
`js/src/cv/platforms/*.js` list URLs, an auth check, ordered steps built
from 12 step actions, selector candidate lists, per-step
`verified` / `documented` / `draft` confidence, write groups, and an
`evidence` array citing the public observation each step was derived from.
Plans are validated when the registry loads, so coverage is visible and
countable without a browser (`cv-platforms` prints "TopCV: 32 steps,
0 verified"), and `js/tests/helpers/markup-fixture.js` regenerates each
plan's expected DOM from the plan itself so
`RUN_BROWSER_E2E=1 npm run test:e2e:cv` drives all seven plans through a
real Chromium instance, including a deliberate markup-drift case each.

`js/src/cv/telemetry.js` records every run: 13 event types, FNV-1a markup
fingerprints, HTML and PNG artifacts under `<artifactDir>/<runId>/`, and
redaction of e-mails, phone numbers and long tokens on by default — so the
first run against a real profile is debuggable after the fact rather than
only under a debugger.

The same facade is exposed three ways: seven `/api/cv/*` routes
(`js/src/server/routes-cv.js`), six CLI commands (`cv-platforms`,
`cv-plan`, `cv-read`, `cv-diff`, `cv-sync`, `cv-telemetry`), and a CV
screen in the SPA (`js/src/web/cv-view.js`, translated in en/ru/zh/hi).
Writes never happen implicitly: planning is the default and an explicit
`--apply` / `dryRun: false` is required, with `--paths` / `--groups`
narrowing a sync to chosen fields or editor groups. A backend without the
CV routes (the `std`-only Rust server, which cannot launch a browser) says
so on the screen instead of rendering an empty table. `playwright` and
`browser-commander` stay optional dependencies and are kept out of the web
bundle, enforced by `js/tests/web-bundle.test.js`. Documented in
`docs/CV-SYNC.md` (+ ru/zh/hi) and `docs/case-studies/issue-29/`.
