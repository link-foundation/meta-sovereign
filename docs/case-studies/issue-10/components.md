# Components & libraries surveyed for issue #10

This document catalogues the in-tree primitives we reuse and the
upstream tooling / standards / prior art we considered while planning
the issue #10 work. The case-study `README.md` summarises the
findings; this file is the reference list.

## In-tree primitives reused

| Module                            | Why it matters for issue #10                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/src/web/views.js`             | The thirteen view components whose empty branch we now replace with a connection guide.                                                                                                                  |
| `js/src/web/dom.js`               | The `api.*` shim, including `api.sources()` and `api.status()`. We use these to detect "is the user already connected to anything?".                                                                     |
| `js/src/web/discover.js`          | Provides `discoverServer`, `saveServerOverride`, `clearServerOverride`. The empty-state CORS path uses `saveServerOverride` to point the SPA at a freshly started local server.                          |
| `js/src/sources/index.js`         | `sourceRegistry` lists every provider (telegram, vk, x, whatsapp, facebook, linkedin, habr-career, hh, superjob). Each entry exposes `parseArchive` and (mostly) `live.*`.                               |
| `js/src/sources/<provider>.js`    | Each provider adapter contains the canonical "how to authenticate" surface — the env var name (`VK_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, …) and the API base URL. We reflect these into the in-app guide. |
| `js/src/web/client.js`            | `OfflineClient.isOnline()` lets us detect the "no server reachable, proxy unavailable" branch and label the empty-state CTA appropriately.                                                               |
| `js/src/storage/browser-store.js` | Confirms that any data the user pastes into the SPA persists locally first, no server required.                                                                                                          |

## Upstream tooling and standards

### Empty-state guidance

| Source                                                                                                                                    | Why we cite it                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Nielsen Norman Group — Designing Empty States](https://www.nngroup.com/articles/empty-state-interface-design/)                           | Three rules: explain why it's empty, what to do next, and surface in-context learning rather than relying on a forced tutorial.     |
| [Carbon Design System — Empty states pattern](https://carbondesignsystem.com/patterns/empty-states-pattern/)                              | Provides the structural template (icon + headline + body + primary action) that we mirror in the React `ConnectionGuide` component. |
| [Smashing Magazine — Empty States in User Onboarding](https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/) | Frames the empty state as the first screen of onboarding, not as an error condition.                                                |
| [Material Design — Empty states](https://m2.material.io/design/communication/empty-states.html)                                           | Discoverability and tone-of-voice guidance for the empty section copy.                                                              |

### CORS / proxy behaviour

| Source                                                                                               | Why we cite it                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [WHATWG Fetch — CORS protocol](https://fetch.spec.whatwg.org/#http-cors-protocol)                    | Authoritative spec for what the browser does on a cross-origin request that fails the CORS check (network error, no readable body).                                    |
| [MDN — Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) | Practical reference; we link to it from the in-app help text so users can understand the diagnostic.                                                                   |
| [WorkOS — Common CORS errors](https://workos.com/blog/common-cors-errors-and-how-to-fix-them)        | Confirms the standard remediation: run a same-origin proxy or have the upstream emit the correct headers.                                                              |
| [HTTPToolkit — CORS proxies, when are they safe?](https://httptoolkit.com/blog/cors-proxies/)        | Recommends self-hosted proxies over shared third-party CORS proxies. We follow that guidance: the SPA recommends `meta-sovereign serve` (local), never a shared proxy. |

### Tour / onboarding libraries (considered, **not** introduced)

| Library                                                      | Licence               | Notes                                                                                                                                          |
| ------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Driver.js](https://github.com/kamranahmedse/driver.js)      | MIT                   | Permissively licensed; ~5 KB; framework-agnostic. Compatible with Unlicense if pulled, but adds a dependency for ~five steps of overlay logic. |
| [React Joyride](https://github.com/gilbarbara/react-joyride) | MIT                   | React-native; popular; pulls in floating-ui, popper, etc. Bigger than we need.                                                                 |
| [Shepherd.js](https://github.com/shipshapecode/shepherd)     | AGPL-3.0 / Commercial | Copyleft; not compatible with the Unlicense posture of this project.                                                                           |
| [Intro.js](https://github.com/usablica/intro.js)             | AGPL-3.0 / Commercial | Same copyleft concern.                                                                                                                         |

We chose to implement a minimal in-tree React tour layer
(`TutorialOverlay`) rather than depend on any of these. The tour
runs once per browser, can be skipped per step, fully turned off,
and re-opened from a button in the app shell. The total addition is
~150 lines of React and stays under the public-domain licence of
the rest of the repository. If the in-tree implementation becomes a
maintenance burden, the smallest permissively-licensed swap is
Driver.js.
