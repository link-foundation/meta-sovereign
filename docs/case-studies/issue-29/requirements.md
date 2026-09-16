# Issue 29 Requirements Matrix

Each row is one sentence of the issue, mapped to the requirement ids
tracked in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) section V and
to the evidence that satisfies it.

## Direct Requirements

| Requirement (issue wording)                                                                | Ids               | Status      | Evidence                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code able to read all CVs **in links notation**.                                           | R-V1              | Implemented | `js/src/cv/model.js` — `cvToLink` / `cvFromLink` round-trip the canonical CV through the same link store as every other entity; snapshots live under `cv:<platform>`.                   |
| Read them **from all websites using `browser-commander`**.                                 | R-V14             | Implemented | `js/src/cv/browser.js` opens a `browser-commander` session (optional dependency, per-platform profile dir); `js/src/cv/runner.js` executes any plan through it.                         |
| **Compare** all of them.                                                                   | R-V2              | Implemented | `js/src/cv/diff.js` — keyed diff plus `compareCvs` matrix; `cv-diff`, `POST /api/cv/compare` and the SPA comparison table all read it.                                                  |
| **Show difference** for all of them.                                                       | R-V17, R-V18      | Implemented | `cv-diff` prints conflicts and missing platforms per path; `js/src/web/cv-view.js` renders `table.cv-comparison` (`screenshots/cv-screen-differences.png`).                             |
| **Do updates and changes.**                                                                | R-V15, R-V20      | Implemented | `updateCvOn` / `syncCvAcross` in `js/src/cv/index.js`; writes need an explicit `--apply` / `dryRun: false`, and can be narrowed with `--paths` / `--groups`.                            |
| Must include **LinkedIn**.                                                                 | R-V7              | Implemented | `js/src/cv/platforms/linkedin.js` — 32 steps, write groups `intro`, `about`, `skills`.                                                                                                  |
| Must include **hh.ru**.                                                                    | R-V6              | Implemented | `js/src/cv/platforms/hh.js` — 30 steps, 3 write groups; the read-only public API is recorded as evidence rather than used as a write path.                                              |
| Must include **career at habr**.                                                           | R-V5              | Implemented | `js/src/cv/platforms/habr-career.js` — 17 steps, 12 verified against live public markup, 2 write groups.                                                                                |
| Must include **naukri**.                                                                   | R-V8, R-E11       | Implemented | `js/src/cv/platforms/naukri.js` — 34 steps, 3 write groups; source adapter bound to the plan.                                                                                           |
| Must include **VietnamWorks**.                                                             | R-V9, R-E12       | Implemented | `js/src/cv/platforms/vietnamworks.js` — 32 steps, 3 write groups; `__NEXT_DATA__` parsing plus `[class*="Module_part"]` selectors for hashed CSS modules.                               |
| Must include **TopCV**.                                                                    | R-V10, R-E13      | Implemented | `js/src/cv/platforms/topcv.js` — 32 steps, 3 write groups; the platform is labelled `blocked-without-browser` because every route answers 403 to a plain client.                        |
| "Even if we don't have direct markup access yet …"                                         | R-V3, R-V4, R-V12 | Implemented | Plans are data, validated at registry load; each step carries `verified` / `documented` / `draft`, and the draft count is printed by `cv-platforms`, `/api/cv/platforms` and the SPA.   |
| "… we should be able all telemetry is in place."                                           | R-V13             | Implemented | `js/src/cv/telemetry.js` — 13 event types, markup fingerprints, HTML/PNG artifacts per run, redaction on by default, store sink surfaced in the SPA and via `cv-telemetry`.             |
| "… full draft of all steps is in place based on public internet knowledge."                | R-V3..R-V11       | Implemented | Every plan step is present for all seven platforms, sourced from the public observations recorded in `external-research.md` and in each plan's `evidence` array.                        |
| "As soon as we start testing we will be able to get all logs, recordings of markup change" | R-V13, R-V14      | Implemented | `selector.fallback`, `step.miss` and `markup.fingerprint` events plus saved HTML snapshots and screenshots make a drifted selector visible after the fact, without a debugger attached. |
| Ensure changes are correct, consistent, validated, tested, documented, logged.             | R-V12, R-V21      | Implemented | Plan validation at load, 487 unit tests, `RUN_BROWSER_E2E=1 npm run test:e2e:cv` driving all seven plans in Chromium, `docs/CV-SYNC.md` (+ ru/zh/hi), telemetry as the logging surface. |
| Scope is the entire repository; apply each change in all places.                           | —                 | Implemented | CLI, HTTP API, SPA, exports, sources catalogue, Connections, README ×4, `docs/REQUIREMENTS.md` ×4, `docs/USER-GUIDE.md` ×4, `docs/SERVER-PARITY.md` ×4, `docs/CV-SYNC.md` ×4.           |
| Ensure all CI/CD checks pass.                                                              | —                 | Implemented | `verification-logs/` holds the final local gate runs; CI runs the same commands.                                                                                                        |

## Derived Requirements

| Requirement                                                   | Ids   | Status      | Evidence                                                                                                                                     |
| ------------------------------------------------------------- | ----- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| The same operations must exist over HTTP.                     | R-V16 | Implemented | `js/src/server/routes-cv.js` — seven routes; `js/tests/cv-server.test.js`.                                                                   |
| The same operations must exist in the terminal.               | R-V17 | Implemented | Six `cv-*` commands; `js/tests/cv-cli.test.js`.                                                                                              |
| A CV screen in the SPA.                                       | R-V18 | Implemented | `js/src/web/cv-view.js`; `js/tests/cv-web.test.js`; `screenshots/`.                                                                          |
| The Node-only CV runtime must never enter the browser bundle. | R-V19 | Implemented | `js/scripts/build-web.mjs` externalises `playwright` and `browser-commander`; enforced by `js/tests/web-bundle.test.js`.                     |
| Writes can be narrowed to specific paths or editor groups.    | R-V20 | Implemented | A supported-but-unselected field is reported as `deselected`, never conflated with `unsupported`.                                            |
| Every plan is exercised against a real browser.               | R-V21 | Implemented | `js/tests/helpers/markup-fixture.js` + `js/tests/e2e-cv-browser.mjs`.                                                                        |
| A backend without the CV routes degrades visibly.             | R-V22 | Implemented | `serverFetch` treats the Rust server's catch-all 404 as "unavailable"; the screen shows `[data-cv="unavailable"]` instead of an empty table. |

## Non-Requirements

- **Shipping real credentials or a live-profile test.** The issue
  explicitly anticipates that markup access comes later; committing
  account credentials to run CI against real profiles would be both
  unsafe and against every one of these platforms' terms.
- **Porting `/api/cv/read` and `/api/cv/sync` to the Rust server.**
  Those two routes launch a browser, which the `std`-only Rust crate
  cannot do. The gap is documented in `docs/SERVER-PARITY.md` §5 and the
  SPA states it rather than failing silently (R-V22).
- **Using platform APIs instead of a browser.** Checked and rejected:
  hh.ru's public OpenAPI exposes no applicant-side resume update, and
  the other five platforms publish no applicant write API at all. See
  `external-research.md`.
- **Auto-applying a sync.** Every write path requires an explicit
  `--apply` (CLI) or `dryRun: false` (API/SPA); planning is the default.
