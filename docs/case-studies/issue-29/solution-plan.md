# Solution Plan

## Alternatives Considered

### Option A: Official platform APIs

The obvious first question is whether these boards can be updated
without a browser at all.

- hh.ru publishes an OpenAPI specification, but the applicant side of it
  is read-only: `/resumes/{resume_id}` declares a `GET` and nothing
  else (see `external-research.md`).
- LinkedIn's write APIs are partner programmes for organisations, not a
  way for a person to edit their own profile.
- Naukri, VietnamWorks, TopCV and superjob.ru publish no applicant write
  API.

Decision: rejected. There is no API path that satisfies "do updates and
changes" for even one of the six platforms the issue names.

### Option B: One scraper module per platform

The traditional shape: `linkedin.js` exports `read()` and `update()`,
each containing Playwright calls.

This fails the issue's central constraint. When markup access does not
exist yet, an imperative module is unverifiable and opaque: nothing can
count how many steps are guesses, the SPA cannot show coverage, and a
selector that silently stopped matching looks the same as a field the
user left blank. It also guarantees six near-identical copies of the
same navigate/wait/read/fill logic, which the repository's duplication
gate (jscpd, threshold 0) would reject on sight.

Decision: rejected.

### Option C: Declarative plans plus one runner

Each platform contributes **data**: URLs, an auth check, ordered steps
with selector candidates, a confidence label per step, write groups, and
an `evidence` array citing what the plan was based on and when. One
runner executes any plan through browser-commander; one telemetry module
records what actually happened.

This is what makes the issue's "even if we don't have direct markup
access yet" requirement satisfiable rather than aspirational:

- a plan can be read, validated, counted and displayed without a
  browser, so `cv-platforms` can say "TopCV: 32 steps, 0 verified";
- confidence is per step, so the honest state of knowledge is visible
  instead of hidden behind code that looks equally confident everywhere;
- adding SuperJob cost one data file and no runner changes;
- the same data drives the fixture generator, so the tests cannot drift
  from the plans — the expected DOM is derived from the plan itself.

Decision: implemented.

## Implementation Steps

1. **Model first** (`js/src/cv/model.js`, `diff.js`). Define the
   canonical CV — map, list and record sections — its links-notation
   round-trip and its path addressing, then keyed diffing on top. Tests
   before any browser code exists.
2. **Plans as data** (`js/src/cv/platforms/`). `steps.js` defines the 12
   step actions and 3 confidence levels; `define.js` validates a plan
   and `index.js` validates every plan at registry load, so a typo is a
   test failure rather than a runtime surprise. Seven plans, each with
   an `evidence` array.
3. **Telemetry before the runner** (`js/src/cv/telemetry.js`). Deliberate
   ordering: the issue's requirement is that the _first_ real run is
   debuggable, so the runner was written against an existing telemetry
   interface rather than having logging retrofitted.
4. **Runner and session** (`runner.js`, `browser.js`). Selector
   candidates are tried in order and a fallback is an event, not a
   shrug; a timeout becomes `step.miss`; the browser profile directory
   persists the login between runs so a user signs in once.
5. **Facade** (`js/src/cv/index.js`): read one, read all, compare,
   update, sync. Every entry point accepts an injected commander, which
   is how the whole flow is unit-tested without a browser.
6. **Three surfaces, one behaviour**: `/api/cv/*` routes, six `cv-*` CLI
   commands, and the SPA screen — each a thin adapter over the facade.
7. **Narrowing** (R-V20): `--paths` / `--groups`, with
   `deselected` reported separately from `unsupported` so "I chose not
   to write this" never looks like "this platform cannot do this".
8. **Real-browser coverage** (R-V21): generate each plan's expected DOM
   from the plan, serve it at the platform's own URLs through Playwright
   interception, drive all seven plans, and include a deliberate drift
   case per platform to prove the miss is reported.
9. **Degrade visibly** (R-V22): a backend without `/api/cv/*` (the Rust
   server) shows a notice instead of an empty table.
10. **Documentation in four languages**: `docs/CV-SYNC.md` plus ru/zh/hi,
    a new section in each `docs/USER-GUIDE*.md`, requirement rows in each
    `docs/REQUIREMENTS*.md`, a parity section in each
    `docs/SERVER-PARITY*.md`, and README bullets — registered in
    `js/tests/docs-language.test.js` so a missing translation fails CI.

## Regression Risks

- **The Node-only runtime leaking into the web bundle.** `playwright`
  and `browser-commander` are `optionalDependencies` and must never be
  bundled. Mitigation: `js/tests/web-bundle.test.js` fails if either
  appears in the built asset (R-V19).
- **A dry run performing a write.** Mitigation: writes live behind an
  explicit `--apply` / `dryRun: false`; `js/tests/cv-sync.test.js`
  asserts that a dry-run sync issues zero `fill` calls to the commander,
  and that lifting the dry run is what produces them.
- **Silent selector drift on the first real run.** Mitigation:
  fallbacks, misses and markup fingerprints are telemetry events with
  saved HTML and screenshots; the e2e test proves a drifted selector is
  reported rather than swallowed.
- **Plans and tests drifting apart.** Mitigation: the fixture markup is
  generated _from_ the plans, so a plan change that the fixture cannot
  satisfy fails the e2e run.
- **Leaking personal data into artifacts.** Mitigation: redaction of
  e-mails, phone numbers and long tokens is on by default in
  `telemetry.js`, with tests covering each pattern.
- **Documentation drifting out of sync across languages.** Mitigation:
  `js/tests/docs-language.test.js` requires all four siblings and a
  consistent language header.

## Debugging Notes

Two artifacts from building this are kept for reuse:

- `experiments/cv-screen-screenshot.mjs` — boots a real server whose CV
  commander is a browser session serving generated platform markup, then
  drives the SPA through read → compare → plan and screenshots each
  state. This is the fastest way to see the whole loop without an
  account on any platform.
- `js/tests/e2e-cv-browser.mjs` (`RUN_BROWSER_E2E=1 npm run
test:e2e:cv`) — the same interception technique as a pass/fail gate over
  all seven plans, printing a per-platform table of fields, steps,
  groups, verified fills and drift misses.

Telemetry is the production debugging surface and is on by default;
`cv-telemetry --type=step.miss` is the first command to run when a live
platform stops behaving, and the run's HTML snapshot under
`<artifactDir>/<runId>/` shows the markup that was actually served.
