# Issue 37 Case Study: desktop apps on every platform, and the web app with a local server

Issue: https://github.com/link-foundation/meta-sovereign/issues/37

Prepared on 2026-10-11 UTC for PR 38.

## Summary

Issue 37 asks for desktop app releases, docs and user landing pages
automated the way [konard/vk-bot-desktop](https://github.com/konard/vk-bot-desktop)
(studied at `8fbf3b7c`) and [link-assistant/formal-ai](https://github.com/link-assistant/formal-ai)
(studied at `d209aac6`) automate them. It also asks for a full web app built
the same way: features are restricted until a local server is running,
and that server must be installable through npm.

Before this PR the repository already had an Electron shell (`npm run
electron`) and a GitHub Pages build of the SPA. But nothing packaged or
released the shell. The packaged app could not even start (the store
path, entry guard and electron-updater import were wrong). The hosted
SPA could not detect a local JS server because that server sent no
CORS headers.

| #   | Requirement (from the issue text)                                                | Where it is met                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Desktop apps for multiple platforms, fully supported                             | `desktop/electron-builder.config.cjs`: Linux AppImage/deb/tar.gz, macOS dmg/zip and Windows installer/portable, each for x64 and arm64. `js/electron/main.js` runs correctly when packaged                                       |
| R2  | Automate desktop releases like vk-bot-desktop and formal-ai                      | `.github/workflows/desktop-release.yml`: native runners per OS and arch, smoke tests, `SHA256SUMS.txt`, `BUILD-PROVENANCE.txt` and attestations uploaded to the GitHub release. Gated by `js/scripts/desktop-release-gate.mjs`   |
| R3  | Docs                                                                             | [`docs/USER-GUIDE.md`](../../USER-GUIDE.md) §4 and §5 (and the zh/hi/ru translations), [`README.md`](../../../README.md), this case study                                                                                        |
| R4  | User landing pages                                                               | `https://link-foundation.github.io/meta-sovereign/download/` (`js/src/web/download/`): detects the OS and arch, lists every installer from the newest release that has them, shows checksums and falls back to the Releases page |
| R5  | A full web app made "in a similar way"                                           | The same SPA on GitHub Pages (`.github/workflows/pages.yml`, `js/scripts/build-pages.mjs`), which now also deploys `/download/`                                                                                                  |
| R6  | …with restricted features unless a local server is started                       | Browser-only mode notice (`js/src/web/web-mode.js`, `web-mode-banner.js`) with a **Check again** button (`api.rediscover()`). The server allows the hosted origin via CORS (`js/src/server/cors.js`)                             |
| R7  | The local server is installable via npm                                          | `npx -y meta-sovereign serve` / `npm i -g meta-sovereign`, plus `npx -y github:link-foundation/meta-sovereign serve`, which works before the first npm publish (see "npm publishing" below)                                      |
| R8  | Collect the issue data in `docs/case-studies/issue-37`                           | `data/`                                                                                                                                                                                                                          |
| R9  | Deep case study plus online research                                             | This file and [`external-research.md`](external-research.md)                                                                                                                                                                     |
| R10 | List each and every requirement                                                  | This table, expanded in [`solution-plan.md`](solution-plan.md)                                                                                                                                                                   |
| R11 | Solutions and plans for each requirement, checking existing components/libraries | [`solution-plan.md`](solution-plan.md) and the alternatives table in [`external-research.md` §7](external-research.md#7-alternatives-and-reusable-components)                                                                    |
| R12 | Everything in a single pull request                                              | PR 38                                                                                                                                                                                                                            |

## Local artifacts

- `data/issue-37.json`, `data/issue-37-comments.json`,
  `data/pr-38-comments.json`: the issue and PR conversation as
  downloaded from the GitHub API.
- `verification-logs/desktop-build-linux-x64.txt`,
  `desktop-smoke-linux-x64.txt` and `desktop-launch-linux-x64.txt`:
  a local electron-builder build, the package contents check, and
  the packaged app starting its embedded server and window
  (`experiments/issue-37/desktop-launch-smoke.mjs`).
- `verification-logs/cors-before.txt` and `cors-after.txt`: a page on another
  origin calling a real local server in Chromium, Firefox and WebKit
  (`experiments/issue-37/hosted-web-local-server.mjs`). With `main`'s
  server every request fails in every engine. With this PR an
  allow-listed origin succeeds everywhere, and an unlisted origin is still
  refused.
- `verification-logs/download-page-check.txt` and `web-mode-check.txt`:
  the landing page and the browser-only notice in Chromium
  (`experiments/issue-37/download-page-check.mjs`, `web-mode-check.mjs`).
- Screenshots in [`../../screenshots/issue-37/`](../../screenshots/issue-37/):
  the packaged Linux app (`desktop-linux-x64.png`), the download page
  with a release (`download-page-ready.png`), without one
  (`download-page-fallback.png`) and in Russian on a phone
  (`download-page-mobile-ru.png`), and the browser-only notice
  (`web-mode-offline.png`, `web-mode-mobile-ru.png`).

## Reference repositories

Both reference repositories ship the same layout of GitHub release assets,
which this PR adopts:
`<name>-desktop-<os>-<arch>-<version>.<ext>` (for Windows,
`windows-installer` and `windows-portable`), plus `SHA256SUMS.txt` and
`BUILD-PROVENANCE.txt`. Release v0.12.2 of vk-bot-desktop and release v0.352.1
of formal-ai were checked through the GitHub API.

What was reused:

- electron-builder with `--publish never` on native runners (`ubuntu-latest`,
  `ubuntu-24.04-arm`, `windows-latest`, `windows-11-arm`, `macos-latest`),
  with assets uploaded in a separate step.
- An ad-hoc macOS signing hook (`desktop/adhoc-sign-mac.cjs`, modelled on
  `scripts/adhoc-sign-mac.cjs`) when no Developer ID is configured. Apple
  silicon refuses unsigned executables.
- Optional signing secrets with the same names: `MAC_CSC_LINK`,
  `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER`. With all five set, builds outside pull requests are
  signed with the Developer ID and notarized. Without them, they are
  ad-hoc signed.
- A GitHub Pages landing page that reads the release list from the
  GitHub API and links to the exact asset names.

What differs:

- This repository's version is created by changesets in "Checks and
  release" with `GITHUB_TOKEN`. Releases created that way trigger no
  workflow, so the desktop workflow runs on `workflow_run`, as formal-ai
  does.
- The landing page reuses the SPA's i18n (en, ru, zh, hi) and the asset
  catalogue that the tests share with electron-builder's `artifactName`
  templates (`js/src/web/download/downloads.js`). A renamed artifact
  therefore fails `npm test` instead of producing a dead download link.

## Problems found and fixed while doing this

Each item was reproduced first: in CI logs (kept locally under
`ci-logs/`), in a local build, or in a browser.

1. **The packaged app could not start.** The store was written to the
   cwd (`/` or read-only in a packaged app). The entry guard looked for
   a script path in `argv`, which packaged apps do not have, so no window
   ever opened. And `await import('electron-updater')` has no named
   `autoUpdater` (it is a lazy CommonJS getter), so updates were always
   off. Fixed in `js/electron/main.js` (`<userData>/store`, start from
   `package.json#main`, `pickAutoUpdater`). Found by launching a local
   linux-x64 build under Xvfb, and covered by
   `js/tests/mobile-electron-packaging.test.js`.
2. **The hosted SPA could never see a local JS server.** The server sent
   no CORS headers, so the browser hid every response from
   `discoverServer()`. `js/src/server/cors.js` now answers allow-listed
   origins (`https://link-foundation.github.io`, `https://localhost`,
   `capacitor://localhost` by default). It refuses preflights and
   state-changing requests from every other origin, so an arbitrary
   website still cannot write to the store. It can be configured with
   `MS_ALLOW_ORIGINS` or `meta-sovereign serve --allow-origin=<origins|none>`.
   See `cors-before.txt` and `cors-after.txt` and
   `js/tests/server-cors.test.js`.
3. **Linux smoke step failed with exit 141.** `dpkg-deb --contents … | grep -q`
   closes the pipe early, the writer dies of SIGPIPE, and `pipefail`
   fails the step. Listings now go to a file first.
4. **Windows smoke step failed** with `op_Addition` on `FileInfo`. The
   installer and portable lists are now wrapped in `@()`.
5. **macOS bundle named `meta-sovereign.app`.** electron-builder
   26.15.3 takes `appInfo.productFilename` from `executableName`, so the
   top-level Linux/Windows executable name also named the `.app`.
   `mac.executableName` restores `Meta Sovereign.app`.
6. **macOS app was not signed at all on CI** (`codesign: code object is
not signed at all`). There were two causes:
   - electron-builder skips signing on pull requests unless
     `CSC_FOR_PULL_REQUEST=true`.
   - With `CSC_IDENTITY_AUTO_DISCOVERY=false` and no identity,
     `MacTargetHelper.findSigningIdentity` returns `null`, so `sign()`
     returns before it ever calls the custom `mac.sign` hook. Only
     `mac.identity: "-"` creates the ad-hoc identity.

   The ad-hoc path now sets both. formal-ai's `desktop-release.yml`
   records the same finding at `d209aac6` (lines 394–400). Pull requests
   never receive the Developer ID secrets.

7. **The desktop release never ran on `main`.** "Checks and release"
   ends in failure because `Publish to npm` returns E404 (next section).
   `workflow_run` then reported a failure, and the desktop workflow
   skipped itself. `js/scripts/desktop-release-gate.mjs` reads the
   jobs of that run. If the only failed step is `Publish to npm`
   (which runs _after_ the version commit), the version is final, and the
   desktop apps are built and attached anyway. A failure anywhere else
   still stops the build. On the real runs, main run 38172634346 gives
   `build=true` and desktop run 38176417737 gives `build=false`
   (`js/tests/desktop-release-gate.test.js`).

## npm publishing (needs a maintainer)

The release job logs:

```
npm error 404 Not Found - PUT https://registry.npmjs.org/meta-sovereign - Not found
```

`npm view meta-sovereign` also returns E404: the package has never been
published. The workflow publishes through OIDC trusted publishing
(`id-token: write`, no token), and a trusted publisher can only be
configured for a package that already exists. The usual bootstrap is
one manual `npm publish` (or a granular token), followed by adding the
trusted publisher (repository `link-foundation/meta-sovereign`, workflow
`release.yml`) in the package settings on npmjs.com
([WordPress Playground release handbook](https://developer.wordpress.org/playground/handbook/contributing/releases/),
[G. Bahmutov, "How To Publish To NPM From GitHub Actions"](https://glebbahmutov.com/blog/npm-publish-from-github/)).
No CI change can do this, so it is left to a maintainer.

Until then:

- `npx -y github:link-foundation/meta-sovereign serve` installs and
  starts the same server straight from GitHub. The browser-only notice
  and the user guide show it next to the npm command.
- The desktop release no longer depends on the npm publish (item 7
  above).

## Known limits

- **Safari** treats `http://127.0.0.1` as mixed content on an HTTPS page
  ([WebKit bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934)),
  so the hosted app stays in browser-only mode there. The notice tells
  Safari users to open the app from the local server
  (`http://127.0.0.1:8787`) or use the desktop app. The WebKit result in
  `cors-after.txt` is from an `http://localhost` page, so it does not
  test this case.
- **Chrome 142+ / Firefox 153+** ask the user once for Local Network
  Access before the hosted page may reach `127.0.0.1`. That prompt is
  the browser's and cannot be skipped.
- **The Rust server** answers every response with
  `access-control-allow-origin: *` (`rust/crates/meta-sovereign-server/src/http.rs`).
  This works with the hosted app, but it is more permissive than the JS
  allow-list. Porting the allow-list to Rust is a follow-up.
- **WebSocket `Origin` checks** are not part of this PR. The CORS
  allow-list covers HTTP only.
- **Unsigned builds:**
  - Ad-hoc macOS builds open through System Settings → Privacy &
    Security → "Open Anyway", and cannot auto-update (Squirrel.Mac needs
    a real signature).
  - Unsigned Windows builds show SmartScreen's "More info → Run anyway".
  - Windows arm64 has no update feed of its own, so auto-update is off
    there (`unsupportedUpdateArch`).
- **Live verification.** The desktop release on `main` and the deployed
  `/download/` page with real assets can only be checked after merge.
  Pull requests run the full build and smoke test matrix with publishing
  turned off.

## Research

See [`external-research.md`](external-research.md) for electron-builder,
signing, electron-updater, GitHub Actions, HTTPS→localhost access, the
alternatives that were considered (Tauri, Neutralino, Wails, Electron
Forge, update-electron-app, PWA) and the landing page design.
