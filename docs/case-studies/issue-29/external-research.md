# External Research

The issue asks for "a full draft of all steps … based on public
internet knowledge". Every platform was probed from the public internet
on **2026-09-16** before its plan was written, and each observation is
recorded twice: here, and machine-readably in the `evidence` array of
the matching `js/src/cv/platforms/*.js` file, so a future reader can see
what the plan was based on and when that basis was last checked.

The probes used plain HTTPS requests with a desktop User-Agent. No
account was created, no login was attempted, and no platform's terms
were circumvented — where a site refused an anonymous client, that
refusal _is_ the finding, and it is what makes `browser-commander` the
right tool rather than an HTTP client.

## LinkedIn — `markupAccess: authenticated`

- `https://www.linkedin.com/in/me/` → HTTP 302 to
  `https://www.linkedin.com/uas/login?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fme`.

This single response confirms both facts the plan needs: `/in/me/` is a
valid alias for the signed-in user's own profile (so the plan never has
to ask for a vanity URL), and an un-authenticated session lands on
`/uas/login`, which is exactly the login check the plan uses via
`requireUrl`. All field selectors are therefore `documented` or `draft`,
not `verified`.

## hh.ru — `markupAccess: authenticated`

- `https://api.hh.ru/openapi/specification/public/en` → the public
  OpenAPI specification (1.07 MB of YAML). The applicant profile exposes
  `resumes_url` with the example `https://api.hh.ru/resumes/mine`, and
  `/resumes/{resume_id}` declares **only** a `GET` (`operationId:
get-resume`). There is no applicant-side create, update or publish
  operation.
- `https://hh.ru/` → HTTP 403 for a plain HTTPS GET with a browser
  User-Agent. A real browser session is required to reach any markup.
- `https://github.com/link-foundation/browser-commander` →
  browser-commander resolves text matches to `[data-qa="…"]` selectors
  when they are available, which matches hh's markup conventions.

The read-only API is the reason hh.ru is driven through a browser like
everything else: the official integration surface cannot write a résumé.
The `data-qa` convention is why hh's selector candidates lead with
`[data-qa]` attributes rather than class names.

## Habr Career — `markupAccess: public-profile`

- `https://career.habr.com/` → HTTP 200 without authentication.
- `https://career.habr.com/login` → HTTP 200; a dedicated login page.
- `https://career.habr.com/lightalloy` (a public profile, 135 KB) →
  embeds the full profile state in
  `script[type="application/json"][data-ssr-state="true"]` with
  `visitor` / `user` / `resume` keys. Each résumé section carries an
  `edit` field which is `null` for guests — i.e. the same document tells
  the runner both what the profile contains and whether the current
  session may edit it.
- The same page confirms the DOM fallbacks: `.page-title__title`,
  `.skills-list-show-item--profile`, `.job-position__title`,
  `.job-position__duration`, `.resume-education-item__title`,
  `.user-contacts-item`.

Habr Career is the only platform where the read path could be verified
against live markup end to end, which is why it carries 12 `verified`
steps — and why the SSR-state approach (`extractJson`) was generalised
into a first-class step action instead of a Habr-specific hack.

## Naukri — `markupAccess: authenticated`

- `https://www.naukri.com/mnjuser/profile` → anonymous request redirects
  to `https://www.naukri.com/nlogin/login?URL=//www.naukri.com/mnjuser/profile`.

Confirms both the profile route and the login route, and gives the plan
its `requireUrl` login check. The editor's field selectors are drafted
from Naukri's long-standing `mnjuser` profile layout and are labelled
accordingly.

## VietnamWorks — `markupAccess: authenticated`

- `https://www.vietnamworks.com/my-profile` → HTTP 200 for guests, but
  `__NEXT_DATA__` reports `page: "/my-profile"` and `pageProps`
  containing only `{params, userIP}`. The profile itself is fetched
  client-side after login.
- The same page exposes stable hooks `[data-tab="my-profile-tab"]` and
  `[data-tab="attached-cv"]`, while component classes are hashed CSS
  modules (`ProfileStrength_header__JzLOw`,
  `ProgressBar_progressFill__FF_I8`,
  `WorkingPreferences_iconEdit__f3VcT`).
- `https://www.vietnamworks.com/wowcv` → HTTP 200 — the CV builder
  behind the downloadable CV.
- `https://secure.vietnamworks.com/login/en?client_id=3` → the login
  form host; `https://www.vietnamworks.com/login` redirects to
  `secure.vietnamworks.com/register/en?client_id=3`.

Two design decisions follow directly. The plan reads `__NEXT_DATA__`
first (it will be populated once the session is authenticated) and only
falls back to the DOM; and because the class names are hashed per build,
selectors use `[class*="Module_part"]` prefixes, which survive a rebuild
even though the hash suffix changes. A selector that only matched via
the prefix still records a `selector.fallback` event, so drift is
visible.

## TopCV — `markupAccess: blocked-without-browser`

- `https://www.topcv.vn/` → HTTP 403.
- `https://www.topcv.vn/quan-ly-cv` → HTTP 403 (CV manager candidate).
- `https://www.topcv.vn/ho-so` → HTTP 403 (profile candidate).
- `https://www.topcv.vn/dang-nhap` → HTTP 403 (login candidate).

No markup is reachable at all without a real browser, so TopCV has its
own `markupAccess` class and every step is `draft`. The route names come
from TopCV's public navigation vocabulary, and the plan lists them as
candidates so the first real run reports which one actually resolves
instead of failing on a hard-coded guess.

## superjob.ru — `markupAccess: authenticated`

- `https://www.superjob.ru/resume/` → HTTP 200 for an anonymous request;
  the résumé area is reachable.

SuperJob is not named in the issue. It is included because it is a major
board in the same market as hh.ru and adding it cost one data file —
which is the point of making plans data rather than code.

## How The Research Shapes The Code

| Observation                                     | Consequence in the codebase                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Five of seven sites refuse anonymous clients.   | `browser-commander` + a persistent browser profile, not an HTTP client.                                   |
| hh.ru's applicant API is read-only.             | No API write path is offered anywhere; writes are browser-driven only.                                    |
| Two sites ship server-rendered JSON state.      | `extractJson` is a first-class step action (R-V4), preferred over CSS selectors.                          |
| One site hashes its CSS class names per build.  | Selector candidate lists plus `[class*=…]` prefixes and `selector.fallback` events.                       |
| Most markup is unverifiable until a real login. | Per-step `verified` / `documented` / `draft` labels, surfaced in the CLI, API and SPA rather than hidden. |
| First contact with real markup happens off-CI.  | Telemetry with markup fingerprints, HTML snapshots and screenshots per run (R-V13).                       |

## Re-Checking This Research

The `evidence` arrays are the machine-readable copy of this page:

```bash
npx meta-sovereign cv-plan --platform=topcv --json > topcv-plan.json
node -e "console.log(require('./topcv-plan.json').evidence)"
```

Every entry carries an `observedAt` date. When a platform's plan starts
producing `selector.fallback` or `step.miss` telemetry, the first step
is to re-run the probe above, update the evidence and the `observedAt`
date, then adjust the selector candidates — in that order, so the
repository never carries a selector nobody can explain.
