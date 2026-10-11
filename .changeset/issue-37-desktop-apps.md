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
