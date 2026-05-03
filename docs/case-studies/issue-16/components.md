# Components & libraries — issue #16

This file lists existing components — both inside this repository and
upstream — that the PR #17 solution leans on, and the rationale for
not introducing any new runtime dependencies.

## In-repo reuse

| Component                                              | Path                                            | What we reuse                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `providerCatalogue` / `connectionGuides` / `tryDirect` | `js/src/web/connection-guides.js`               | Provider list, per-section guide map, fetch classifier (`http` / `cors` / `network`).           |
| `wrapSecretStore`                                      | `js/src/storage/secret-store.js`                | Transparent AES-256-GCM at rest for `secret:*` link payloads. Used to persist tokens.           |
| Sync filter for `secret:*`                             | `js/src/sync/index.js` + `secret-store.test.js` | Outbound suppression and inbound drop of `secret:*` events on every peer.                       |
| `parseArchive` per source                              | `js/src/sources/{telegram,whatsapp,...}.js`     | Take an uploaded archive and turn it into links — Settings card uses these directly.            |
| `discoverServer` + `createOfflineClient`               | `js/src/web/discovery.js` (and `dom.js`)        | Browser-first / server-fallback pattern unchanged from issue #10.                               |
| `ConnectionGuide` (per-section empty state component)  | `js/src/web/connection-guide.js`                | Re-used as the rendering primitive on Settings, plus extended with `<input>` and `<file>` rows. |
| `e2e-browser-spa.mjs` smoke harness                    | `js/tests/e2e-browser-spa.mjs`                  | Boots the SPA in a real browser; the new e2e tests follow the same shape.                       |
| `nav-items.js`                                         | `js/src/web/nav-items.js`                       | Where the new `settings` surface is registered.                                                 |

## Standards / specs

- **WHATWG Fetch.** `fetch()` rejects with `TypeError` on any network
  failure, including CORS preflight rejection. `tryDirect` already
  branches on this.
- **HTML `<input type="file">` & `FileList`.** Used for archive
  uploads. No drag-and-drop polyfill is needed.
- **DataTransfer / `paste` event.** Used for the textarea fallback
  (`R-O5`) — plain `<textarea onChange>` is enough.
- **Web Crypto via `crypto.subtle`.** Used by `wrapSecretStore`. The
  Settings card never touches it directly.

## Why not introduce these libraries

| Considered library | Reason it is not added                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `react-hook-form`  | Adds a 30 KB dependency to a SPA whose forms each have ≤ 3 fields; the existing `useState` pattern is sufficient.   |
| `zod` / `valibot`  | Token validation is opaque (provider tells us via the probe). No client-side schema work needed.                    |
| `axios`            | We already use `fetch` and need `tryDirect`'s classification to remain the single source of truth.                  |
| JSZip              | The MVP accepts the inner JSON file from a Facebook DYI export; full ZIP unpacking is deferred (see solution plan). |
| `dotenv-vault`     | Tokens are encrypted at rest by `wrapSecretStore`; an external secret-vault dependency adds no value.               |

## Upstream provider SDKs

We deliberately do **not** ship any provider SDK in the browser bundle
(`@telegraf/telegraf`, `whatsapp-web.js`, `passport-vkontakte`, etc.).
They expand the bundle by hundreds of kilobytes for behaviour we use
once (a probe + an archive parse). The probes are plain `fetch` calls
to documented REST endpoints; archive parsers are tiny.
