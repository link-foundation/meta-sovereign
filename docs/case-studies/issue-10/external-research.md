# External research for issue #10

This file collects the prior art and external evidence we used while
designing the empty-state and tutorial work in PR #11. It complements
[`components.md`](./components.md) (which catalogues the libraries we
reuse) by documenting the reasoning that _led_ to those choices.

## 1. Empty states are the primary onboarding surface

Nielsen Norman Group's empty-state guidance ([NN/g, _Designing Empty
States in Complex Applications_](https://www.nngroup.com/articles/empty-state-interface-design/))
identifies three rules for the empty state in a complex app:

1. **Explain _why_ the space is empty** — never leave the user
   guessing whether the app is broken.
2. **Tell the user _what to do next_** — surface the action that
   will populate the section.
3. **Lean on in-context learning** — a tutorial that is shown when
   the user reaches a screen that is empty _for them_ is more
   memorable than a forced welcome tour.

Carbon Design System's [empty states
pattern](https://carbondesignsystem.com/patterns/empty-states-pattern/)
codifies the same shape into a layout: illustration + headline + body
copy + primary action, with optional secondary action. We follow that
template directly in the new `ConnectionGuide` React component.

Smashing Magazine's [_The Role Of Empty States In User
Onboarding_](https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/)
adds two practical observations relevant to this PR: (1) empty
states are typically a user's _first_ screen, not an error path, so
the copy must be welcoming rather than apologetic; and (2) when the
empty section depends on an external integration (here: a provider
connector or a local server) the empty state must teach the user
how to wire that integration up — not redirect them to documentation.

These three references converge on the design we ship: every section
that is currently empty renders a `ConnectionGuide` describing
**what feeds this section**, **how to import an archive**, **how to
authenticate against the live API**, and **how to start a local
server** if a CORS or storage path needs it.

## 2. Browser-only fetches and CORS

The MDN [Cross-Origin Resource Sharing
(CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
reference describes the diagnostic the browser surfaces when an
unauthorised cross-origin request fails: the JS code receives a
network error (a `TypeError: Failed to fetch`) with no response and
no headers — the actual reason is only visible in the browser's
DevTools console. Programs cannot detect "this was specifically a
CORS failure" with full reliability, but they can detect "the request
threw before producing a response" and treat that as the CORS
hypothesis when the URL is cross-origin.

The WHATWG Fetch spec confirms this in its [CORS protocol
section](https://fetch.spec.whatwg.org/#http-cors-protocol): on a
failed CORS preflight or an actual response missing the
`Access-Control-Allow-Origin` header, the request is set to a
_network error_ state, which surfaces as a thrown `fetch()` promise.

WorkOS's [_Common CORS errors and how to fix
them_](https://workos.com/blog/common-cors-errors-and-how-to-fix-them)
catalogues the practical remediations: change the upstream to send
the correct headers, or proxy through a same-origin server. The
upstream providers we integrate with (VK, Telegram, X, WhatsApp,
Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru) do **not**
opt their bearer-token APIs into `Access-Control-Allow-Origin: *` —
this is by design, since the API key would otherwise be readable from
any web origin. The remediation in our setting is therefore always
the same-origin proxy provided by `meta-sovereign serve`.

HTTP Toolkit's [_What are CORS proxies, and when are they
safe?_](https://httptoolkit.com/blog/cors-proxies/) cautions against
using third-party CORS proxies, since the proxy can read every byte
of every request including bearer tokens. We follow that advice:
the SPA only ever recommends the user-controlled, locally-run
`meta-sovereign serve` proxy (R-J3, R-F4) — never a public proxy
service.

The new `tryDirect` helper in `js/src/web/connection-guides.js`
implements this end-to-end: it attempts the live request from the
browser, catches the error, classifies it as a probable CORS
failure when the request was cross-origin and yielded no response,
and surfaces a "start the local server" CTA inline.

## 3. Tour libraries and licensing

A 2026 survey of the four headline guided-tour libraries
([_Driver.js vs Intro.js vs Shepherd.js vs
Reactour_](https://inlinemanual.com/blog/driverjs-vs-introjs-vs-shepherdjs-vs-reactour/),
[OnboardJS comparison](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared))
shows the licensing landscape:

- [Driver.js](https://github.com/kamranahmedse/driver.js) — MIT.
- [Reactour](https://github.com/elrumordelaluz/reactour) — MIT.
- [React Joyride](https://github.com/gilbarbara/react-joyride) — MIT.
- [Intro.js](https://github.com/usablica/intro.js) — AGPL-3.0 with
  a paid commercial licence.
- [Shepherd.js](https://github.com/shipshapecode/shepherd) —
  AGPL-3.0 with a paid commercial licence.

This repository is licensed under the [Unlicense](../../LICENSE)
(public domain). Pulling in an AGPL dependency is a clear policy
regression. The MIT options would work, but our needs are minimal —
five callouts, "next" and "skip" buttons, a "turn it off" toggle, a
"turn it back on" entry point in settings — and the smallest
permissive option (Driver.js) still ships ~5 KB of overlay code
plus a runtime DOM measurement loop that the React reconciler is
already doing.

We therefore implement an in-tree React tour layer
(`TutorialOverlay`) sized to our actual flows. It is ~150 lines of
React, ships under the same public-domain licence as the rest of the
repo, and is fully testable in unit tests because each step is just
a React component prop.

## 4. Local-first guarantee, restated

The empty-state work happens _on top of_ the local-first guarantee
already established in the existing requirement set:

- R-J1 — Browser-only storage works fully offline.
- R-J6 — A browser-only deployment is a complete database engine.
- R-L4c — The deployed bundle defaults to a usable, write-capable,
  fully offline experience when no server is reachable.

The Ink & Switch _Local-First Software_ essay ([Kleppmann et al.,
2019](https://www.inkandswitch.com/essay/local-first/)) frames this
guarantee as one of seven ideals for personal-data software. Issue
#10 doubles down on the same value: even when the user has not yet
authenticated to any provider and has not yet started a local
server, the SPA stays useful — it now uses that idle time to teach
the user how to plug in.

## 5. Self-contained install instructions

The instruction text we render in the connection guides comes
directly from [`docs/USER-GUIDE.md`](../../USER-GUIDE.md) and the
provider env-var conventions in `js/src/sources/<provider>.js`. We
quote the relevant lines verbatim into the SPA so the user does not
have to leave the application to read them — addressing R-M7
(self-contained install) and R-J3 / R-F4 (local server is the
canonical way to unlock full features).
