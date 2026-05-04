# Case Study: Issue #16 — Connections to Telegram, Facebook, WhatsApp are not working as expected

**Issue:** [#16 — Connections to Telegram, Facebook, WhatsApp are not working as expected](https://github.com/link-foundation/meta-sovereign/issues/16)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-16-d636f69ce59c`
**Pull Request:** [#17](https://github.com/link-foundation/meta-sovereign/pull/17)

This case study collects every directive from issue #16, decomposes it
into atomic requirements (`R-O*`), records the prior art and tooling
surveyed, and lays out the solution plan that PR #17 implements
against the existing local-first / privacy-first design constraints
already established in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md)
(see new section **O. Provider connection settings (issue #16)**).

The artefacts in this folder are:

| File                   | Purpose                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                                 |
| `requirements.md`      | Atomic requirement list (`R-O*`) extracted from the issue.                                           |
| `solution-plan.md`     | Phased plan mapping requirements to concrete deliverables in PR #17.                                 |
| `components.md`        | Catalogue of upstream tooling and standards consulted.                                               |
| `external-research.md` | Summary of external research about provider auth probes, CORS-safe endpoints, and uploads.           |
| `screenshot1.png`      | Reproduction screenshot from the issue body — Telegram "Try directly" returning HTTP 404.            |
| `screenshot2.png`      | Reproduction screenshot from the issue body — WhatsApp + Facebook "Try directly" returning HTTP 400. |
| `data/`                | Raw artefacts (issue body, comments) used to build this study.                                       |

---

## 1. Vision (paraphrased from the issue)

PR #11 (issue #10) added per-section connection guides with a "Try
directly" probe that fires a `fetch` against each provider's API.
Issue #16 reports that the probe URLs are **wrong**: Telegram returns
`HTTP 404` because the Bot API needs a token in the path
(`/bot{token}/getMe`), and Meta's Graph API returns `HTTP 400` because
`/me` requires an `access_token`. The reporter also points out three
deeper UX gaps:

- **No way to enter credentials.** The guide cards have explanatory
  text but no `<input>` fields — even users who already have a token
  cannot exercise the probe.
- **No way to upload archive files.** The guides describe how to
  export an archive but the SPA never offers `<input type="file">` or
  a paste textarea, so the import path is documentation-only.
- **Connections are scattered across thirteen sections.** Even after
  fixing the probe URLs, having a Telegram credential prompt repeated
  inside every section that consumes Telegram data (chat, contacts,
  outreach, broadcast, …) makes the surface area enormous and the
  state management messy. A single Settings page must own the
  credentials and every other section must link to it.
- **Tests must run both locally _and_ on the published GitHub Pages
  site.** It is not enough to pass `npm test` — the same SPA bundle
  served from `https://link-foundation.github.io/meta-sovereign/`
  must pass an end-to-end smoke test in a real browser, because that
  is the surface real users see.
- **Single PR, until done.** As with issue #10, plan and execute
  everything in one PR (`#17`) and iterate until each requirement is
  fully addressed.

## 2. Why this case study exists

The issue explicitly requests:

> _We need to collect data related about the issue to this repository,
> make sure we compile that data to `./docs/case-studies/issue-{id}`
> folder, and use it to do deep case study analysis (also make sure to
> search online for additional facts and data), list of each and all
> requirements from the issue, and propose possible solutions and
> solution plans for each requirement (we should also check known
> existing components/libraries, that solve similar problem or can
> help in solutions)._

This document is the central deliverable of that request.

## 3. Method

1. **Source extraction** — the issue body and comment list are
   captured via `gh` to `data/issue-16.json` and
   `data/issue-16-comments.json` so the case study is self-contained.
   The two screenshots referenced in the issue are downloaded as
   `screenshot1.png` and `screenshot2.png`.
2. **Requirement decomposition** — see `requirements.md`. Each item
   carries a stable `R-O*` identifier so changesets, PRs, and code
   comments can reference it.
3. **External research** — see `external-research.md`. Each provider's
   public API documentation was consulted to identify the correct
   probe endpoint, the minimum authentication payload, and the CORS
   posture of the endpoint when called from a browser.
4. **Component survey** — see `components.md`. Existing pieces of
   `meta-sovereign` (the `wrapSecretStore`, the per-source
   `parseArchive`, the `tryDirect` classifier from issue #10) are
   reused before any new abstractions are introduced.
5. **Solution plan** — see `solution-plan.md`. Each `R-O*` row maps
   to one or more concrete deliverables in PR #17, with the order of
   landing chosen so the PR is reviewable in slices.

## 4. Reproduction

The screenshots that the issue links to (`data/issue-16.json` →
`body`) are mirrored in this folder so the case study survives even
if `user-attachments` URLs ever expire:

- `screenshot1.png` — Telegram card on the **Chat** view. Endpoint
  shown is `https://api.telegram.org/bot/getMe` and the probe
  output is `Failed (http 404)`.
- `screenshot2.png` — WhatsApp Cloud and Facebook Graph cards on the
  same view. Both endpoints
  (`https://graph.facebook.com/v22.0/me`) return `Failed (http 400)`.

The reproduction is deterministic — both endpoints can be hit with
`curl` and they confirm the same status codes:

```
$ curl -s -o /dev/null -w '%{http_code}\n' https://api.telegram.org/bot/getMe
404
$ curl -s -o /dev/null -w '%{http_code}\n' https://graph.facebook.com/v22.0/me
400
$ curl -s -o /dev/null -w '%{http_code}\n' 'https://api.telegram.org/bot12345:fake/getMe'
401
$ curl -s -o /dev/null -w '%{http_code}\n' 'https://graph.facebook.com/v22.0/me?access_token=invalid'
400   # but body is now a structured "Invalid OAuth access token" error
```

So the fix is twofold:

1. **Probe URLs accept user-supplied credentials.** A Telegram probe
   with no token cannot succeed; the URL template must interpolate a
   token (or fall back to a tokenless health check, see
   `external-research.md`).
2. **The UI must accept credentials.** Even a perfect URL template is
   useless without an `<input>` for the token — issue #16's central
   complaint.

## 5. Constraints we are honouring

- **Privacy-first.** Tokens entered into the SPA must be stored in
  `secret:*` links via `wrapSecretStore`. They are never logged,
  never shipped to peers (`secret:*` is filtered by `createPeer`'s
  outbound filter and dropped on inbound, see
  [`secret-store.test.js`](../../../js/tests/secret-store.test.js)),
  and they are encrypted at rest in the underlying `data.lino`.
- **Browser-first / server-fallback.** Probes always run from the
  browser first; only on a CORS-classified failure does the guide
  point at the local server (this is the `R-M5..R-M8` contract from
  issue #10 — issue #16 must not regress it).
- **Local-first.** No new external dependency is added that requires
  network at build time. New runtime dependencies must be vendored
  or pure-JS.
- **One PR.** All changes land in PR #17; nothing is split off.

## 6. Outcome (executive summary)

PR #17 ships:

- a new **Settings → Connections** nav surface that owns the credential
  inputs (text fields), the file uploads (archive import), and the
  paste-textarea fallback for archive content;
- corrected probe URL **templates** per provider (`/bot{token}/getMe`,
  `/me?access_token={token}`, etc.) wired into a probe runner that
  uses `tryDirect`'s classifier and reports `http`, `cors`, or
  `network` outcomes;
- a **"Connect first"** CTA on every per-section guide that deep-links
  to the relevant Settings card;
- secret-store-backed persistence for entered credentials and
  in-flight `secret:*` filtering preserved on the sync wire;
- a unit-test layer for the probe templates, an integration test for
  the Settings → secret-store round-trip, an e2e Playwright test that
  exercises the local SPA against the dev server, and a second
  Playwright test that runs against the deployed GitHub Pages URL
  after the Pages workflow finishes.

The mapping from issue text → `R-O*` → deliverable lives in
[`solution-plan.md`](./solution-plan.md).
