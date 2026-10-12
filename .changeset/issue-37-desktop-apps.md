---
'meta-sovereign': minor
---

Multi-platform desktop apps and a download page (issue #37).

- `desktop/electron-builder.config.cjs` and `npm run desktop:build`
  package the Electron shell for Linux (AppImage, deb, tar.gz; x64 and
  arm64), macOS (dmg, zip; x64 and arm64) and Windows (NSIS installer
  and portable exe; x64 and arm64). Linux artifact names are normalized
  to the `meta-sovereign-desktop-<os>-<arch>-<version>.<ext>` scheme
  shared with the download page catalogue
  (`js/src/web/download/downloads.js`).
- `.github/workflows/desktop-release.yml` builds every platform on
  native runners after a successful release on `main` (or on demand),
  smoke-tests each build, uploads installers, update feeds,
  `SHA256SUMS.txt`, `BUILD-PROVENANCE.txt` and build attestations to
  the GitHub release, and dry-runs the build on pull requests.
  `create-github-release.mjs` is idempotent and accepts `--target`.
- The packaged app keeps its store in the user data folder, starts from
  `package.json#main`, and loads electron-updater's CommonJS
  `autoUpdater` correctly from ESM.
- The desktop release also runs when `Publish to npm` is the only
  failed step of the release run (`js/scripts/desktop-release-gate.mjs`).
- macOS builds are named `Meta Sovereign.app`; without Developer ID
  secrets they are ad-hoc signed (`mac.identity=-`), so they launch on
  Apple Silicon after **Open Anyway**.
- A download page at `/download/` on GitHub Pages detects the user's
  system, offers the matching installer from the newest release with
  desktop assets, and checks a file against `SHA256SUMS.txt` in the
  browser.
- The hosted web app shows a browser-only mode notice when no local
  server answers, with the `npx` commands, a **Check again** button and
  a link to the download page.
- The JS server answers cross-origin requests from the hosted app
  (`https://link-foundation.github.io`) and the Capacitor app,
  including Private Network Access preflights. Other origins can be
  allowed with `serve --allow-origin=<origins>` or `MS_ALLOW_ORIGINS`;
  `--allow-origin=none` turns cross-origin access off.
