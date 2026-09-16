# CV synchronisation across job platforms (languages: en • [zh](CV-SYNC.zh.md) • [hi](CV-SYNC.hi.md) • [ru](CV-SYNC.ru.md))

A CV normally lives in seven places at once: LinkedIn, hh.ru, Habr
Career, Naukri, VietnamWorks, TopCV, SuperJob. Each of them holds a
slightly different, slightly stale copy, and nobody keeps all seven in
step by hand.

This subsystem reads every one of those profiles through a real
browser, turns each into the same canonical CV, shows what differs,
and pushes the agreed values back. It is fully local: the browser runs
on the user's own machine with the user's own logged-in session, and
nothing is sent anywhere except to the platform the user is already
using.

Related documents: [REQUIREMENTS section V](REQUIREMENTS.md#v-cv-synchronisation-across-job-platforms),
[USER-GUIDE](USER-GUIDE.md#cv-synchronisation), the
[issue 29 case study](case-studies/issue-29/README.md).

## 1. Layers

| Layer     | File                           | Responsibility                                                                      |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Model     | `js/src/cv/model.js`           | One canonical CV shape and its links-notation projection (R-V1).                    |
| Diff      | `js/src/cv/diff.js`            | Keyed, path-addressed comparison and reconciliation (R-V2).                         |
| Plans     | `js/src/cv/platforms/*.js`     | One declarative, data-only plan per platform (R-V3..R-V11).                         |
| Registry  | `js/src/cv/platforms/index.js` | Catalogue, validation and confidence accounting (R-V12).                            |
| Telemetry | `js/src/cv/telemetry.js`       | Every step, value, fallback and fingerprint, redacted (R-V13).                      |
| Runner    | `js/src/cv/runner.js`          | Executes a plan against browser-commander (R-V14).                                  |
| Browser   | `js/src/cv/browser.js`         | Opens a persistent browser-commander session (R-V14).                               |
| Facade    | `js/src/cv/index.js`           | `readCvFrom`, `compareAllCvs`, `updateCvOn`, `syncCvAcross` (R-V15).                |
| HTTP      | `js/src/server/routes-cv.js`   | `/api/cv/*` (R-V16).                                                                |
| CLI       | `js/src/cli/cv-commands.js`    | `cv-platforms`, `cv-plan`, `cv-read`, `cv-diff`, `cv-sync`, `cv-telemetry` (R-V17). |
| SPA       | `js/src/web/cv-view.js`        | The CV screen (R-V18), kept out of the browser bundle's Node path (R-V19).          |

The layers only ever talk downward, and the runner is the only piece
that knows a browser exists. That is why the whole flow — including
"push these four fields to Naukri" — is testable without one.

## 2. Canonical CV

```text
cv
  basics
    name: Anna Ivanova
    headline: Backend Engineer
    location: Yerevan, Armenia
  skills
    skill: Go
    skill: Kubernetes
  experience
    position
      company: Acme
      title: Backend Engineer
      start: 2022-01
```

Sections are of three kinds:

- **maps** — `basics` (`name`, `headline`, `summary`, `email`, `phone`,
  `location`, `website`, `birthDate`) and `preferences` (`employment`,
  `schedule`, `salary`, `currency`, `relocation`, `remote`);
- **lists** — `skills`;
- **records** — `experience`, `education`, `languages`, `links`, each
  with an identity key (`experience` is keyed by company + title +
  start) so a diff matches the same job across two platforms instead
  of reporting "everything changed" when one site lists jobs in the
  opposite order.

Every value is addressed by a path: `basics.headline`, `skills`,
`experience[0].title`. Paths are the vocabulary of the diff, of
`--paths` on the CLI, and of the `writePaths` allow-list each platform
declares.

## 3. Plans are data

A plan is an ordered list of steps. Nothing in a plan is a function,
so a plan can be printed, diffed, validated in CI and shipped for a
platform whose authenticated markup we have not been able to fetch
yet.

| Action        | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `goto`        | Navigate to a URL (templates like `{{login}}` are resolved).               |
| `waitFor`     | Wait for a selector; a timeout is recorded as drift, not a crash.          |
| `requireUrl`  | Assert we are still where we expect — this is the "am I logged in?" check. |
| `click`       | Click the first match.                                                     |
| `fill`        | Type a canonical value into a field, with read-back verification.          |
| `press`       | Send a key.                                                                |
| `read`        | Read one scalar into a path.                                               |
| `readList`    | Read every match into a list section.                                      |
| `readRecords` | Read one record per container match, fields relative to it.                |
| `extractJson` | Parse a server-rendered JSON blob and map it with a named mapper.          |
| `snapshot`    | Store the HTML of a region as a run artifact.                              |
| `screenshot`  | Store a PNG of the viewport as a run artifact.                             |

Every selector may be a candidate list (`a, b, c`). The runner tries
them in order and reports a `selector.fallback` event whenever it has
to use anything but the first — which is the earliest possible warning
that a site changed its markup.

Every step carries a confidence level:

- `verified` — observed in markup we fetched ourselves; the platform's
  `evidence` array records the URL, the date and the finding.
- `documented` — taken from vendor documentation or a public API.
- `draft` — inferred from public knowledge, to be confirmed by the
  first authenticated run. Drafts are not guesses hidden in code: they
  are labelled, counted, printed by `cv-plan` and surfaced in the SPA.

## 4. Platform coverage

| Platform     | Id             | Region | Markup access             | Read paths | Write paths | Steps | Verified          | Drafts |
| ------------ | -------------- | ------ | ------------------------- | ---------- | ----------- | ----- | ----------------- | ------ |
| LinkedIn     | `linkedin`     | global | authenticated             | 7          | 4           | 32    | 7                 | 25     |
| hh.ru        | `hh`           | ru     | authenticated             | 10         | 4           | 30    | 6 (+2 documented) | 22     |
| Habr Career  | `habr-career`  | ru     | public profile            | 2 (+JSON)  | 3           | 17    | 12                | 5      |
| Naukri       | `naukri`       | in     | authenticated             | 10         | 3           | 34    | 7                 | 27     |
| VietnamWorks | `vietnamworks` | vn     | authenticated             | 9          | 8           | 32    | 11                | 21     |
| TopCV        | `topcv`        | vn     | blocked without a browser | 12         | 6           | 32    | 5                 | 27     |
| SuperJob     | `superjob`     | ru     | authenticated             | 6          | 2           | 18    | 5                 | 13     |

`markupAccess` is honest about what we could see from outside a
session: `public-profile` means the reading half was verified against
live markup, `authenticated` means the profile redirects to a login
page, and `blocked-without-browser` means the site answers a plain
HTTP client with a challenge page — which is exactly why the whole
subsystem drives a real browser.

`cv-platforms --json` and `GET /api/cv/platforms` return this table
from the registry itself, so it cannot drift from the code.

## 5. Update groups

Writes are grouped, because that is how these sites work: opening the
"Headline" modal, typing, saving and closing is one unit. Each group
has an id (`intro`, `about`, `skills`, `headline`, `key-skills`,
`employment`, `personal`, `preferences`, `cv-builder`, `objective`,
`expectation`, `cv-document`, `title`, `publish`) and can be selected
with `cv-sync --groups=…` (or `"groups": [...]` on `/api/cv/sync`), so
a user can push a headline without touching anything else.
`--paths=basics.headline` narrows the same run by CV path instead; a
path that a platform supports but the user did not select is reported
as `deselected`, which is deliberately a different number from
`unsupported`.

A platform's `writePaths` is an allow-list. `syncCvAcross` reports
changes that fall outside it as `unsupported` rather than pretending
to apply them: LinkedIn will not let anyone rewrite an employment
record through the profile form, and the plan says so instead of
silently failing.

## 6. Telemetry

Every run emits an ordered event stream, persisted into the store
under the `cv-telemetry` token prefix and replayable with
`cv-telemetry` or `GET /api/cv/telemetry`:

| Event                | Emitted when                                                   |
| -------------------- | -------------------------------------------------------------- |
| `run.start`          | A read/update/drift run begins.                                |
| `step.start`         | Before each step, with its action and confidence.              |
| `step.ok`            | The step did what it said, with the selector actually used.    |
| `step.skip`          | An optional step whose precondition did not hold.              |
| `step.miss`          | The selector matched nothing, or a wait timed out.             |
| `step.error`         | The step threw.                                                |
| `value.read`         | A value entered the CV (redacted).                             |
| `value.write`        | A value was typed into the page, with the verification result. |
| `selector.fallback`  | A later candidate was used instead of the first.               |
| `markup.fingerprint` | The FNV-1a fingerprint of a snapshotted region.                |
| `markup.changed`     | That fingerprint differs from the recorded baseline.           |
| `screenshot`         | A PNG artifact was written.                                    |
| `run.finish`         | Totals, duration and outcome.                                  |

Redaction is on by default: e-mail addresses, phone numbers and
anything that looks like a long token are replaced before an event is
stored. Artifact paths are exempt, because a path the user cannot open
is not evidence.

With `--artifacts=<dir>`, `snapshot` and `screenshot` steps write
`<dir>/<runId>/<name>.html` and `.png`. That is the recording of a
markup change the issue asks for: when a site moves a field, the run
that noticed it has the HTML and the picture next to the event stream.

Both segments of that path are spelled so that every file system
accepts them: a run id reads `linkedin-2026-09-16T07-00-00.000Z`
rather than an ISO timestamp, because Windows treats a `:` in a path
as an alternate-data-stream separator and refuses to create the
directory at all.

## 7. Drift detection

`markup.fingerprint` events from a healthy run form a baseline. A
later run compares against it and emits `markup.changed` for every
region that moved, before any value is written. The runner also treats
"the selector is gone" as data rather than as a crash: a missed
non-optional step aborts the run with `code: 'step-missed'` and a
reason naming the selector, so the first authenticated run against a
site we have only drafted produces a precise list of what to fix.

## 8. Using it

```bash
# what we support, and how much of it is verified
meta-sovereign cv-platforms
meta-sovereign cv-plan --platform=linkedin

# read profiles into the local store (opens a browser)
meta-sovereign cv-read --platforms=linkedin,hh --login=anna --artifacts=./cv-runs

# compare what is already stored — no browser needed
meta-sovereign cv-diff --prefer=linkedin

# plan the convergence; add --apply to actually write
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# write one field only, or one editor group only
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# what happened during a run
meta-sovereign cv-telemetry --type=step.miss
```

The first `cv-read` for a platform opens a headed browser
(`--headed`), the user signs in once, and the session is kept in a
per-platform profile directory (`--profile=<dir>`). Subsequent runs
reuse it. Credentials are never asked for, stored or transmitted by
this repository.

The same operations are available over HTTP (`/api/cv/platforms`,
`/plan`, `/stored`, `/read`, `/compare`, `/sync`, `/telemetry`) and in
the SPA's **CV** screen, which lists platforms with their draft
counts, shows the comparison matrix, and refuses to run a live read
from a browser tab — a browser cannot drive another browser, so the
SPA links to the CLI instead.

## 9. Testing

| Level            | What runs                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit             | Model, diff, plan validation, runner, telemetry — with a fake commander.                                                                                                |
| Fixture          | `js/tests/helpers/markup-fixture.js` rebuilds each plan's expected DOM from the plan itself.                                                                            |
| Browser (opt-in) | `RUN_BROWSER_E2E=1 npm run test:e2e:cv` serves those fixtures at the platforms' own URLs through Playwright interception and drives all seven plans with real Chromium. |

The fixture generator is the reason the browser test is worth
something: it derives the page from the plan's selectors, so a plan
and its fixture cannot drift apart, and the e2e exercises the shipped
path — `openBrowserSession` → browser-commander → runner → telemetry —
rather than a mock of it.
