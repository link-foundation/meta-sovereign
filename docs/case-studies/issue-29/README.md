# Issue 29 Case Study: CV synchronisation across job platforms

Issue: https://github.com/link-foundation/meta-sovereign/issues/29

Prepared on 2026-09-16 UTC for PR 30.

## Summary

Issue 29 asks for code that can read every CV the user keeps on the
popular job boards in links notation through
[`browser-commander`](https://github.com/link-foundation/browser-commander),
compare them, show the differences, and write updates back — for
LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks and TopCV at a
minimum. It also asks for something more unusual: the work must not
wait for markup access. Where a site cannot be inspected without a real
logged-in session, the repository should still carry a full draft of
every step plus the telemetry needed to debug it on the first real run.

The implemented solution is a `js/src/cv/` subsystem in four layers —
a canonical CV model in links notation, one declarative plan per
platform, a platform-agnostic runner over browser-commander, and a
facade exposed through the CLI, the HTTP API and the SPA — with run
telemetry attached to every layer. Seven platforms ship plans (the six
named in the issue plus superjob.ru), every step carries a
`verified` / `documented` / `draft` confidence label, and every plan is
driven through a real Chromium instance in CI-runnable end-to-end tests
before it ever meets a real profile.

## Local Artifacts

Raw GitHub data is preserved under `data/`:

- `issue-29.json` and `issue-29-comments.json` (no comments were posted)
- `pr-30.json`, `pr-30-conversation-comments.json`,
  `pr-30-review-comments.json`, and `pr-30-reviews.json` (all empty —
  the PR received no review feedback during implementation)

Final local verification logs are preserved under `verification-logs/`:

- `local-npm-test-final.txt`
- `local-npm-lint-final.txt`
- `local-npm-format-check-final.txt`
- `local-jscpd-final.txt`
- `local-build-web-final.txt`
- `local-e2e-cv-browser-final.txt`

Verification screenshots are preserved under `screenshots/`. They were
produced by `experiments/cv-screen-screenshot.mjs`, which serves every
platform's fixture markup at the platforms' own URLs through Playwright
request interception, hands that browser session to a real server via
`startServer({ cv: { commander } })`, and then drives the SPA:

- `cv-screen-catalogue.png` — the CV screen on first open: all seven
  platforms, their markup-access class, step confidence counts and
  "no snapshot yet".
- `cv-screen-after-read.png` — after "Read profiles": every platform has
  a snapshot timestamp and a telemetry run.
- `cv-screen-differences.png` — the comparison table with per-field
  values from each platform and the platforms that are missing the field.
- `cv-screen-sync-plan.png` — a dry-run sync plan: writable paths,
  unsupported paths and the explicit "dry run" marker.
- `cv-screen-telemetry.png` — the run history with per-run event counts
  and recorded problems.

The container did not include the `file` utility, so the screenshots
were validated with PNG magic bytes and IHDR dimensions instead:

```text
89 50 4e 47 0d 0a 1a 0a
```

## Timeline

All times UTC on 2026-09-16.

- 05:57 — Issue 29 opened.
- 06:28 — Branch `issue-29-e17abd0f073c` and draft PR 30 created.
- 06:38 — `15e1c9f` canonical CV model in links notation (R-V1, R-V2).
- 06:46 — `6f952d3` declarative plans for all seven platforms
  (R-V3..R-V12), written from the public-internet research recorded in
  `external-research.md`.
- 06:47 — `88687ad` run telemetry with markup fingerprints, redaction
  and pluggable sinks (R-V13).
- 06:51 — `2e6225a` platform-agnostic plan runner over browser-commander
  (R-V14).
- 06:54 — `676530f` read/compare/update facade (R-V15).
- 06:59 — `cfc0d50` Naukri, VietnamWorks and TopCV source adapters bound
  to the plans (R-E11..R-E13).
- 07:04 — `01bbeb4` `/api/cv/*` routes (R-V16).
- 07:07 — `9f4e4eb` `cv-platforms` / `cv-plan` / `cv-read` / `cv-diff` /
  `cv-sync` / `cv-telemetry` CLI commands (R-V17).
- 07:16 — `bff4a15` keep the Node-only CV runtime out of the web bundle
  (R-V19); `abb1f0a` the SPA CV screen (R-V18).
- 07:22 — `a1d97d1` Connections entries for the browser-only platforms.
- 08:03 — `95b6646` fixes found by running the plans in a real browser.
- 08:06 — `805fd52` fixture-driven browser end-to-end test for all seven
  plans (R-V21).
- 08:16 — `3ebfa0b` `--paths` / `--groups` narrowing (R-V20); `1986b8c`
  a backend without the CV routes degrades visibly (R-V22).
- 08:17 — `aef47a5` + `12194b5` `docs/CV-SYNC.md` and requirement tags.
- 08:23 — `7a03c60` ru / zh / hi translations of the CV documentation.

## Observed Problem

Before this PR the repository had no notion of a CV on an external job
board at all. `msg:*`, `person:*` and `secret:*` links covered
messaging and contacts; the résumé stored under `/api/resume` was a
local document with no connection to LinkedIn, hh.ru or anything else.
Keeping six profiles consistent was entirely manual work, and there was
no place in the codebase where the knowledge "this is where LinkedIn
keeps the headline, and this is how you edit it" could live.

The hard part is that most of these platforms cannot be inspected the
way an ordinary web integration is:

- `https://www.linkedin.com/in/me/` answers `302` to the login page.
- A plain `GET https://hh.ru/` answers `403`; hh's public OpenAPI spec
  exposes a read-only `GET /resumes/{resume_id}` and no applicant-side
  update operation at all.
- Every TopCV route answers `403` without a real browser.
- `https://www.naukri.com/mnjuser/profile` redirects anonymous clients
  to `/nlogin/login`.
- VietnamWorks serves `/my-profile` to guests, but `__NEXT_DATA__`
  carries only `{params, userIP}` — the profile arrives client-side
  after login — and its component classes are hashed CSS modules.

So a "just write the selectors" approach has nowhere to start, and a
"wait until we have accounts" approach leaves the repository empty.

## Root Causes

1. **No canonical CV model.** Without one shared shape there is no
   definition of "the same field on two platforms", so comparison and
   reconciliation cannot be expressed at all.
2. **Platform knowledge had nowhere to live.** Encoding it as imperative
   scripts would make it invisible to tests and to the UI; nothing could
   report "we have 32 steps for LinkedIn, 3 of them verified".
3. **No markup access for most platforms.** Login walls and anti-bot
   `403`s mean the first contact with real markup happens on a user's
   machine, not in CI — so the failure has to be diagnosable from what
   the run recorded, after the fact.
4. **A browser cannot drive another browser.** The SPA can render the
   catalogue and diff, but live reads and writes need a Node process,
   which is exactly the kind of gap that otherwise fails silently.

## Implemented Fix

- **Canonical model** (`js/src/cv/model.js`): map sections (`basics`,
  `preferences`), a list section (`skills`) and record sections
  (`experience`, `education`, `languages`, `links`), addressed by path
  (`basics.headline`, `experience[0].title`) and serialised to and from
  links notation with `cvToLink` / `cvFromLink`.
- **Keyed diffing** (`js/src/cv/diff.js`): `compareCvs` builds the
  per-field matrix behind the comparison table and `reconcileCvs`
  derives what each platform must change.
- **Declarative plans** (`js/src/cv/platforms/*.js`): data only, 12 step
  actions, selector candidate lists, per-step confidence, and write
  groups. Server-rendered JSON is preferred over CSS where a site ships
  it (Habr Career's `data-ssr-state`, VietnamWorks' `__NEXT_DATA__`).
  Every plan is validated when the registry loads, so a malformed plan
  fails the test suite rather than a user's run.
- **Telemetry** (`js/src/cv/telemetry.js`): 13 event types, FNV-1a
  fingerprints of the markup each step saw, HTML and PNG artifacts under
  `<artifactDir>/<runId>/`, redaction of e-mails, phone numbers and long
  tokens on by default, and a store sink so runs show up in the SPA.
- **Runner** (`js/src/cv/runner.js`) and **session**
  (`js/src/cv/browser.js`): selector fallbacks are recorded as drift
  rather than swallowed, timeouts become `step.miss` events, and the
  browser profile directory persists the user's login between runs.
- **One facade, three surfaces**: `js/src/cv/index.js` behind
  `cv-platforms`/`cv-plan`/`cv-read`/`cv-diff`/`cv-sync`/`cv-telemetry`,
  the seven `/api/cv/*` routes, and the SPA CV screen — with
  `--paths` / `--groups` narrowing, a mandatory `--apply` for writes, and
  a visible "this backend has no CV routes" notice.
- **Real-browser coverage** (`js/tests/helpers/markup-fixture.js`,
  `js/tests/e2e-cv-browser.mjs`): each plan's expected DOM is rebuilt
  _from the plan itself_ and served at the platform's own URLs through
  Playwright interception, so all seven plans are driven end to end by
  Chromium, including a deliberate markup-drift case per platform.

## External Project Issues

No external upstream issue was filed. Every obstacle — login walls,
`403` responses, hashed CSS module names, hh.ru's read-only applicant
API — is the platforms' intended behaviour, not a defect in
`browser-commander` or in any other dependency.

## Verification Plan

The PR should be accepted only when these checks pass. Local
verification on 2026-09-16 UTC completed the list:

- Focused unit tests for the model, diff, plans, telemetry, runner,
  facade, CLI, server routes and web screen.
- Full project test suite (`npm test`).
- Lint, formatting and duplication checks.
- Web bundle rebuild, including the assertion that `playwright` and
  `browser-commander` never enter it.
- `RUN_BROWSER_E2E=1 npm run test:e2e:cv` — all seven plans driven
  through a real Chromium instance against generated markup.
- SPA screenshots of the catalogue, read, comparison, sync plan and
  telemetry states, produced against a real server.
