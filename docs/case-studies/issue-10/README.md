# Case Study: Issue #10 — Rework UI to never show empty sections; show provider connection paths and a tutorial layer

**Issue:** [#10 — We need to rework the UI, so we don't show sections with empty data](https://github.com/link-foundation/meta-sovereign/issues/10)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-10-a884af8ade4e`
**Pull Request:** [#11](https://github.com/link-foundation/meta-sovereign/pull/11)

This case study collects every directive from issue #10, decomposes it
into atomic requirements (`R-M*`), surveys the prior art and tooling
that help, and records the solution plan that PR #11 implements
against the local-first / privacy-first design constraints already
established in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) (see
new section **M. Newbie-friendly UI (issue #10)**).

The artefacts in this folder are:

| File                   | Purpose                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                         |
| `requirements.md`      | Atomic requirement list extracted from the issue.                                            |
| `solution-plan.md`     | Phased plan mapping requirements to concrete deliverables in this PR.                        |
| `components.md`        | Catalogue of upstream tooling and standards consulted.                                       |
| `external-research.md` | Summary of external research about empty states, onboarding, CORS handling, and tour layers. |
| `data/`                | Raw artefacts (issue body, comments) used to build this study.                               |

---

## 1. Vision (paraphrased from the issue)

The current SPA boots into thirteen tabs that are mostly empty for a
brand-new user — the very first thing they see is "no chats". The
issue reframes the empty state itself as the product's onboarding
surface:

- **No empty placeholders.** Every section that has nothing to display
  must instead show **how to populate that section**: which provider
  feeds it, how to import an archive, how to authenticate against the
  live API, and how to start a local server when CORS or storage
  blocks the browser-only path.
- **Browser-first, server-fallback.** Even with no local server, the
  app should _try_ the live provider APIs straight from the browser.
  When CORS blocks the call, the empty state must explain that this
  is what happened and offer a one-click path to install the local
  server which proxies the request — without ever leaving the SPA.
- **Friendly to newbies.** Tutorial mode walks new users through the
  key flows step by step, can be skipped per step or fully turned off,
  and can be re-opened from settings any time.
- **Self-contained.** The SPA itself contains the install
  instructions, provider guides, and CORS troubleshooting — users
  should not be forced to leave the app to read a GitHub README.
- **Requirement traceability.** All requirements are listed in
  `docs/REQUIREMENTS.md` without grouping by issue (one global list)
  and the case study lives under `docs/case-studies/issue-10/`.
- **Single PR, until done.** Plan and execute everything in one PR
  and iterate until each requirement is fully addressed.

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

1. **Source extraction** — the issue body and (empty) comment list
   are captured via `gh` to `data/issue-10.json` and
   `data/issue-10-comments.json` so the case study is
   self-contained.
2. **Requirement decomposition** — see `requirements.md`. Each item
   carries a stable `R-M*` identifier so changesets, PRs, and code
   comments can reference it.
3. **Component survey** — see `components.md`. Catalogues the
   in-tree primitives (the existing `discoverServer()` flow with
   `metaServer` localStorage override, the offline-first
   `createOfflineClient()`, the nine source adapters, and the
   per-section views) plus the upstream prior art we lean on
   (Carbon's empty-state pattern, NN/g empty-state guidelines).
4. **External research** — see `external-research.md`. Pulls in
   prior art from NN/g empty-state research, Carbon Design System,
   Material's "first run" guidance, the W3C CORS specification, and
   the four headline guided-tour libraries (Driver.js, Shepherd.js,
   Intro.js, React Joyride).
5. **Plan synthesis** — `solution-plan.md` maps each `R-M*` item to
   a concrete change in this PR.

## 4. Headline findings

- **Each navigation section already has a clear data dependency.** The
  ChatView, OperatorView, FactsView, etc. all consume `msg:*` links;
  the PatternsView, RepliesView, AutomationView consume server-side
  endpoints; the BroadcastView and OutreachView consume
  `api.sources()`. We can therefore derive a small `connectionGuides`
  registry that maps each section → the provider connectors and
  archive-import helpers that fill it. The empty path becomes a
  rendered guide, not a blank table.
- **Provider adapters already exist.** Nine `MessageSource` adapters
  (Telegram, VK, X, WhatsApp, Facebook, LinkedIn, career.habr.com,
  hh.ru, superjob.ru) ship `parseArchive()` and (in most cases)
  `live.*` API methods. We do not need new connectors; we need a
  user-visible _front_ for them in the SPA: an upload box for the
  archive parsers, a per-provider credential form for the live API
  surfaces, and a per-provider doc snippet on how to obtain the
  credentials.
- **The CORS path is verifiable in the browser.** When the SPA tries
  a direct `fetch()` to a provider API that does not allow
  `Access-Control-Allow-Origin: *`, the browser surfaces a `TypeError`
  with no response. We can detect that and immediately offer a "this
  is a CORS error — start the local server to proxy this request"
  remediation in the same panel, without leaving the app.
- **Tutorial libraries are mostly AGPL.** Intro.js and Shepherd.js
  are dual-licensed AGPL/commercial; the licence header on this
  project is `Unlicense` (public domain). Bringing in AGPL would be a
  policy regression. Driver.js (MIT) and React Joyride (MIT) are
  compatible — but they are also large for a tour that only runs the
  first time. Our needs are modest: a callout overlay, a list of
  steps, "skip" and "next" buttons, and a "turn back on" entry point
  in settings. We therefore implement a tiny in-tree React tour
  layer (`TutorialOverlay`) under `Unlicense` instead of pulling
  another dependency.
- **The existing offline guarantee is the right base.** Per
  R-J1/R-J6/R-L4c the SPA is already a complete standalone database
  engine offline. The empty-section work _adds_ user-visible
  affordances on top of that guarantee; it does not change the
  storage or sync behaviour.

The complete reasoning — including library URLs and trade-offs — is
in `external-research.md` and `components.md`.

## 5. Constraints honoured

- **Public domain / Unlicense** licensing across the project. No
  AGPL libraries are introduced. The tutorial layer is implemented
  in-tree.
- **No premature optimisation.** The connection-guide registry is a
  plain JS object; the tutorial overlay is one React component; the
  CORS detector is `try { fetch } catch`. No new build step, no new
  dependency.
- **Backwards compatible.** Every existing view keeps its current
  data path; the empty branch is the only one that changes. The
  navigation, theme toggle, axe-core e2e audit, and offline-first
  storage are untouched.
- **Tested.** Each new module ships a unit test, and the SPA-level
  behaviour is covered by an integration test that boots the views
  with an empty store and asserts the connection guide is rendered.

## 6. Current Status

Implemented in PR #11. The full requirement → status mapping is
maintained at the top-level
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) under the new
section **M. Newbie-friendly UI (issue #10)**.

---

## 7. References

The full bibliography is in `external-research.md`. Key entries:

- _Designing Empty States in Complex Applications_ — Nielsen Norman Group. <https://www.nngroup.com/articles/empty-state-interface-design/>
- _Empty states pattern_ — Carbon Design System. <https://carbondesignsystem.com/patterns/empty-states-pattern/>
- _The Role Of Empty States In User Onboarding_ — Smashing Magazine. <https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/>
- W3C Cross-Origin Resource Sharing (CORS) — <https://fetch.spec.whatwg.org/#http-cors-protocol>
- MDN: Cross-Origin Resource Sharing (CORS) — <https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS>
- Driver.js (MIT) — <https://github.com/kamranahmedse/driver.js>
- React Joyride (MIT) — <https://github.com/gilbarbara/react-joyride>
- Shepherd.js (AGPL/commercial) — <https://github.com/shipshapecode/shepherd>
- Intro.js (AGPL/commercial) — <https://github.com/usablica/intro.js>
