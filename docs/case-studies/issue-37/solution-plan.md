# Issue 37: requirements, options and solution plan

For each requirement in [`README.md`](README.md): the options that were
considered, what was chosen and why, the existing components it builds
on, and what is left. Sources are in
[`external-research.md`](external-research.md).

## R1. Desktop apps for multiple platforms

**Options.**

- electron-builder (used by both reference repos).
- Electron Forge.
- Tauri 2.
- Neutralinojs.
- Wails.

See [`external-research.md` §7](external-research.md#7-alternatives-and-reusable-components).

**Chosen: electron-builder 26 around the existing Electron shell.**

- The shell (`js/electron/main.js`) already embeds the Node server, and
  `electron-updater` is already its optional peer.
- Tauri, Neutralino and Wails would need the server rewritten or shipped
  as a sidecar.
- Forge would lose electron-builder's updater integration.

**Plan and status.**

- [x] `desktop/electron-builder.config.cjs`:
  - Linux AppImage/deb/tar.gz, macOS dmg/zip and Windows NSIS/portable,
    each for x64 and arm64.
  - Hardened runtime and entitlements for macOS.
  - A `Meta Sovereign.app` bundle with a `meta-sovereign` executable
    elsewhere.
- [x] `js/scripts/prepare-desktop.mjs` stages a minimal app (the root
      version, `electron-updater` as the only dependency, the built SPA).
      `js/scripts/build-desktop.mjs` runs electron-builder with an Electron
      version resolved from npm.
- [x] Packaged-app fixes in `js/electron/main.js`:
  - the store lives in `userData`;
  - the shell starts from `package.json#main`;
  - the electron-updater CJS interop works;
  - auto-update is off on Windows arm64.
- [x] App icon generated from `desktop/icon.svg`
      (`js/scripts/render-desktop-icon.mjs`).
- [ ] Code signing certificates. The workflow already accepts them; they
      are a maintainer purchase or decision.

## R2. Automated desktop releases

**Options.**

- Extend `release.yml`.
- A separate workflow triggered by `release: published`.
- A separate workflow triggered by `workflow_run` (formal-ai).

**Chosen: a separate `desktop-release.yml` on `workflow_run`, plus
`workflow_dispatch` and a pull request dry run.**

- `release: published` never fires: the release is created with
  `GITHUB_TOKEN`.
- A separate workflow keeps the long desktop matrix off the npm release
  path.

**Plan and status.**

- [x] Resolve job: finds the version and tag, and checks that the release
      exists. On `workflow_run` it reads the triggering run's jobs through
      `js/scripts/desktop-release-gate.mjs`, so a failure in `Publish to npm`
      alone does not cancel the desktop build.
- [x] Native build matrix with smoke tests per OS:
  - Linux: deb/tar contents.
  - Windows: installer and portable executables.
  - macOS: bundle name, bundle id and `codesign --verify` on the `.app`
    and inside each dmg.
- [x] Release assets:
  - artifact names normalized (`js/scripts/normalize-desktop-artifacts.mjs`);
  - `SHA256SUMS.txt`, `BUILD-PROVENANCE.txt` and `actions/attest`
    provenance;
  - checked by `js/scripts/validate-desktop-assets.mjs` before upload;
  - published by `create-github-release.mjs`, which is idempotent and
    accepts `--target`.
- [x] macOS signing:
  - **Developer ID and notarization** when all five secrets are set and
    the event is not a pull request.
  - **Ad-hoc signing** otherwise (`-c.mac.identity=-` plus
    `desktop/adhoc-sign-mac.cjs`).
- [ ] First live run on `main` after merge (it cannot run from a pull
      request).

## R3. Docs

**Chosen:** extend the existing documents instead of adding a new one.

- [x] `README.md`: download, browser-only mode and local server
      commands.
- [x] `docs/USER-GUIDE.md` §4 (desktop apps: download, first launch on
      each OS, updates, checksums) and §5 (the hosted app and the local
      server, CORS options), with the zh, hi and ru versions.
- [x] This case study.

## R4. User landing page

**Options.**

- `releases/latest/download/<name>` links.
- A static list generated at build time.
- A client-side page reading the GitHub Releases API.

**Chosen: a client-side page at `/download/`.**

- Versioned asset names make `latest/download` links fragile.
- The desktop assets arrive minutes after the release is created.
- Built-time lists go stale between Pages deploys.

The page:

- picks the newest release that actually has desktop assets;
- caches it in `sessionStorage` (the unauthenticated API allows 60
  requests per hour);
- detects the OS and arch (`navigator.userAgentData`, then the UA);
- offers every other build;
- verifies a downloaded file against `SHA256SUMS.txt` in the browser
  (`verify.js`);
- falls back to the Releases page.

It uses the SPA's locales (en, ru, zh, hi).

- [x] `js/src/web/download/`, built by `js/scripts/build-pages.mjs`.
- [x] Tests: `js/tests/download-page.test.js`,
      `desktop-downloads.test.js`.
- [x] Browser check: `experiments/issue-37/download-page-check.mjs`.

## R5. Full web app "in a similar way"

The SPA was already deployed to GitHub Pages. The work here makes it a
real counterpart of the desktop app.

- [x] Same release flow: Pages deploys on every push to `main`, and
      `/download/` is part of the same artifact.
- [x] Identical UI: the desktop shell loads the same `js/src/web/`
      bundle.

## R6. Restricted features unless a local server runs

**Options.**

- Hide server-only features.
- Show a notice and keep the browser-store features working.
- Require the server.

**Chosen: a notice, without blocking anything.** The SPA already works
offline (browser store and `OfflineClient` replay), and server-only
features already show "Connect first" CTAs.

What was missing:

- The server sent **no CORS headers**, so the hosted app could never
  detect it (see `verification-logs/cors-before.txt`).
- Nothing told users what the restricted mode is or how to leave it.

**Plan and status.**

- [x] `js/src/server/cors.js`:
  - an allow-list with the hosted origin and Capacitor origins by
    default;
  - preflight answers, including `Access-Control-Allow-Private-Network`;
  - a 403 for unlisted origins on preflight and on state-changing
    methods;
  - configurable with `MS_ALLOW_ORIGINS` or `serve --allow-origin`.
- [x] Browser-only notice (`web-mode.js`, `web-mode-banner.js`):
  - the npm and GitHub `npx` commands;
  - a **Check again** button (`api.rediscover()`; when a server is
    found, it reloads into the full app);
  - a link to the download page and a hint for Safari;
  - it can be dismissed.
- [x] Verified in Chromium, Firefox and WebKit (`cors-after.txt`) and in
      the SPA (`web-mode-check.txt`).
- [ ] Follow-ups:
  - WebSocket `Origin` checks;
  - the same allow-list in the Rust server (it sends `*`);
  - a Safari path other than "open from the server" (WebKit bug 171934).

## R7. The local server installable via npm

**Chosen: the existing `meta-sovereign` package and its `serve`
command.** Nothing new had to be written.

- [x] Documented as `npx -y meta-sovereign serve` and
      `npm i -g meta-sovereign`.
- [x] `npx -y github:link-foundation/meta-sovereign serve` works today.
- [ ] **Maintainer:** publish the first version by hand, then add the
      trusted publisher for `release.yml` on npmjs.com (see README, "npm
      publishing"). Until then every release run ends in E404.

## R8–R12. Case study, research, requirement list, plans, one PR

- [x] `data/` holds the issue, comments and PR conversation.
- [x] `external-research.md` (online sources, versions as of 2026-10-11)
      and `README.md` (requirements, reference repos, root causes, limits).
- [x] This file.
- [x] All in PR 38.
