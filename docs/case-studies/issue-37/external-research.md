# Issue 37: external research

Collected on 2026-10-11 UTC. The electron-builder website loads its
content with JavaScript, so electron-builder facts cite the docs and
sources on GitHub at tag `electron-builder@26.17.0`. Below,
`EB/` stands for
`https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/`.
Items marked **unverified** come from search results that could not be
opened or cross-checked.

## Version snapshot (npm / GitHub, 2026-10-11)

| Project                  | Version                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| electron-builder         | 26.17.0 (GitHub, `v26` dist-tag); npm `latest` 26.15.3; 27 alpha |
| electron-updater         | 6.8.9 (`latest`), 6.8.10 (`v26`), 7.0.0-alpha.9 (`next`)         |
| electron                 | 44.7.0 (this repo keeps the `^41.5.0` peer range)                |
| tauri-cli / tauri-action | v2.12.2 / action-v1.0.0                                          |
| neutralinojs             | v6.10.0                                                          |
| wails                    | v2.14.0 (v3 in beta)                                             |
| electron/forge           | v8.0.1                                                           |
| update-electron-app      | v3.3.0                                                           |
| actions/attest           | v4.2.2 (`attest-build-provenance` is a wrapper over it since v4) |

## 1. electron-builder 26.x

- Config can live in `package.json` `build`, `electron-builder.yml`, or
  a JS/TS/JSON5/TOML file passed with `--config`. Default targets: macOS
  DMG+ZIP, Windows NSIS, Linux Snap+AppImage
  ([EB/website/docs/configuration.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/configuration.md),
  [EB/website/docs/cli.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/cli.md)).
- CLI: `--x64`, `--arm64`, `--universal`, `--dir`, `--projectDir`,
  inline overrides such as `-c.mac.notarize=false`, and
  `-p/--publish onTag|onTagOrDraft|always|never` (same `cli.md`).
- `files` defaults to `**/*`; `package.json` and production
  `node_modules` are always included, devDependencies never
  ([EB/website/docs/contents.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/contents.md)).
  `asar` defaults to `true`; the default `artifactName` is
  `${productName}-${version}.${ext}`
  ([PlatformSpecificBuildOptions.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/packages/app-builder-lib/src/options/PlatformSpecificBuildOptions.ts)).
- File macros: `${arch}`, `${os}`, `${platform}`, `${name}`,
  `${productName}`, `${version}`, `${channel}`, `${env.X}`, and `${ext}`
  in `artifactName`
  ([EB/website/docs/file-patterns.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/file-patterns.md)).
- Publishing: with `GH_TOKEN`/`GITHUB_TOKEN` set, publish implicitly
  defaults to GitHub; that implicit behaviour is deprecated and "will be
  disabled in electron-builder v27", so pass `--publish never` and
  upload in a separate step
  ([EB/website/docs/publish.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/publish.md)).
- Targets: Windows `nsis` (auto-update) and `portable` ("Auto-update:
  Manual"); macOS `dmg`, `zip` (the update payload); Linux `AppImage`
  (delta updates through an embedded blockmap), `deb`, `rpm`, `tar.gz`
  and others
  ([EB/website/docs/targets.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/targets.md)).
- NSIS and archive targets write `.blockmap` files that the updater uses
  for differential downloads
  ([differentialUpdateInfoBuilder.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/packages/app-builder-lib/src/targets/differentialUpdateInfoBuilder.ts)),
  so blockmaps must be uploaded next to the installers.

## 2. macOS signing and notarization

- Without a certificate electron-builder skips signing and "does not
  apply an ad-hoc signature automatically". `mac.identity: "-"` gives an
  ad-hoc signature, which needs the
  `com.apple.security.cs.disable-library-validation` entitlement (or no
  hardened runtime) to avoid "different Team IDs" crashes; Electron also
  needs `allow-jit`
  ([code-signing-mac.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/features/code-signing/code-signing-mac.md)).
- Apple silicon refuses to run unsigned executables; "a simple ad-hoc
  signature is sufficient"
  ([Big Sur 11.0.1 Universal Apps release notes](https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes)).
  That is why the workflow ad-hoc signs when no Developer ID is
  configured, instead of shipping an unsigned arm64 app.
- Since macOS Sequoia, Control-click no longer overrides Gatekeeper; the
  user must use System Settings → Privacy & Security → "Open Anyway"
  ([Apple Developer News, 2024-08-06](https://developer.apple.com/news/?id=saqachfa),
  [support.apple.com/102445](https://support.apple.com/en-us/102445)).
- Notarization: `mac.notarize: true`, `hardenedRuntime: true`,
  entitlements; credentials either `APPLE_ID` +
  `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` or (recommended for CI)
  `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`; certificate
  through `CSC_LINK` + `CSC_KEY_PASSWORD`. Verify with
  `spctl --assess --type exec`, `xcrun stapler validate` and
  `codesign --verify --deep --strict`
  ([notarization.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/features/code-signing/notarization.md)).
- Discrepancy: the EB doc calls `APPLE_API_KEY` base64 `.p8` content,
  but `@electron/notarize` defines `appleApiKey` as the "Absolute path
  to API key" ([README](https://raw.githubusercontent.com/electron/notarize/main/README.md)).
  The workflow therefore writes the secret to a file and exports the
  path.
- "Squirrel.Mac requires the app to be signed for automatic updates to
  work at all" ([electronjs.org code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)),
  so ad-hoc builds cannot auto-update: users re-download from the
  landing page. `xattr -dr com.apple.quarantine` is the common
  workaround for unsigned downloads (**unverified**, community sources
  only).

## 3. Windows signing and SmartScreen

- Unsigned apps show "Windows protected your PC" → "More info" → "Run
  anyway". Signed (OV or EV) apps still warn until reputation builds,
  "EV certificates no longer bypass SmartScreen", and reputation is per
  file hash, so every unsigned version starts from zero
  ([Microsoft Learn: SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
- Azure Artifact Signing (formerly Trusted Signing) starts at
  $9.99/month and requires identity validation
  ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/artifact-signing/overview));
  Electron notes it is "currently limited to developers in certain
  countries". electron-builder supports it through `win.azureSignOptions`
  with `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`, and
  classic certificates through `win.signtoolOptions` / `WIN_CSC_LINK`
  ([code-signing-win.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/features/code-signing/code-signing-win.md)).
- Arm64 hosted runners (`windows-11-arm`, `ubuntu-24.04-arm`) are GA for
  public repositories since 2025-08-07
  ([GitHub changelog](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/)).

## 4. electron-updater

- Supported: macOS (DMG/ZIP through Squirrel.Mac, signed apps only),
  Linux AppImage/DEB/RPM/Pacman, Windows NSIS. Portable and MSI do not
  auto-update. The macOS `zip` target is required, "otherwise
  `latest-mac.yml` cannot be created"
  ([auto-update.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/features/auto-update.md)).
- electron-builder writes `app-update.yml` into the app resources from
  the `publish` config, so the app does not need `setFeedURL`; feed
  files `latest.yml`, `latest-mac.yml`, `latest-linux.yml` (and
  `latest-linux-arm64.yml`) must be uploaded to the release.
- Linux picks `DebUpdater`/`RpmUpdater` from `resources/package-type`,
  otherwise `AppImageUpdater`
  ([electron-updater main.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/packages/electron-updater/src/main.ts)).
- Windows x64 and arm64 builds share one `latest.yml` name. This repo
  keeps the x64 feed and disables auto-update on win32-arm64 unless a
  dedicated feed is configured (`unsupportedUpdateArch` in
  `js/electron/main.js`).

## 5. GitHub Actions

- Runner labels: `ubuntu-latest`, `ubuntu-24.04-arm`, `windows-latest`,
  `windows-11-arm`, `macos-latest` (arm64, now macOS 26), `macos-15`,
  `macos-15-intel` (the last Intel label; Intel macOS support ends when
  the macOS 15 image retires in fall 2027)
  ([runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
  [changelog 2025-09-19](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/)).
  macOS 14 retires on 2026-11-02
  ([changelog 2026-10-01](https://github.blog/changelog/2026-10-01-github-actions-macos-14-runner-image-retirement)).
  This repo builds both macOS architectures on `macos-latest`, which
  also produces one `latest-mac.yml` covering both.
- `actions/attest@v4` needs `id-token: write` and `attestations: write`
  and produces SLSA provenance by default
  ([actions/attest](https://github.com/actions/attest)); users verify
  with `gh attestation verify <file> --repo owner/repo`
  ([gh manual](https://cli.github.com/manual/gh_attestation_verify)).
- "Events triggered by the GITHUB_TOKEN will not create a new workflow
  run" (except `workflow_dispatch`/`repository_dispatch`)
  ([GITHUB_TOKEN docs](https://docs.github.com/en/actions/concepts/security/github_token)).
  The release in `release.yml` is created with `GITHUB_TOKEN`, so a
  `release: published` trigger alone would never fire: the desktop
  workflow also listens to `workflow_run` of "Checks and release".
- `workflow_run` only works from the default branch and fires
  regardless of outcome, so the workflow must check the conclusion and
  whether the release exists
  ([events docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).

## 6. An HTTPS page talking to a server on localhost

This is the core of "full web app … restricted features, unless local
server is started".

- `127.0.0.0/8`, `::1` and `localhost` are "potentially trustworthy", so
  Chromium and Firefox do not block `fetch('http://127.0.0.1:…')` from
  an HTTPS page as mixed content
  ([MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts),
  [MDN mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)).
- **Safari is the exception**: WebKit bug 171934 ("Don't treat loopback
  addresses as mixed content") is still open (last modified 2026-08-19)
  ([bugs.webkit.org/171934](https://bugs.webkit.org/show_bug.cgi?id=171934)).
  Safari users of the hosted app therefore stay in restricted mode, and
  should open the app from the local server itself
  (`http://127.0.0.1:8787`) or use the desktop app.
- JSON `PUT`/`POST`/`DELETE` trigger a CORS preflight; the server must
  answer `Access-Control-Allow-Origin/-Methods/-Headers`
  ([MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)).
  Before this PR the server sent no CORS headers at all, so the hosted
  app could never detect it.
- Chrome 142+ gates public → loopback requests behind a Local Network
  Access permission prompt (split into `local-network` and
  `loopback-network` in 145, extended to WebSockets in 147)
  ([chromestatus 5152728072060928](https://chromestatus.com/feature/5152728072060928),
  [Chrome blog](https://developer.chrome.com/blog/local-network-access),
  [chromestatus 5197681148428288](https://chromestatus.com/feature/5197681148428288)).
  Firefox 153 enables LNA by default
  ([LWN](https://lwn.net/Articles/1083981/)). The user sees one
  permission prompt; the server still needs CORS. The older Private
  Network Access preflight header
  (`Access-Control-Allow-Private-Network: true`) is superseded but
  harmless, and is still sent for older Chromium builds
  ([Chrome PNA blog](https://developer.chrome.com/blog/private-network-access-preflight)).

## 7. Alternatives and reusable components

| Option                         | What it would give                                            | Why not chosen here                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2                        | ~600 KB apps on the system webview, signed updater            | Rewrites the Node server in Rust or ships it as a sidecar; this repo is Node-only ([v2.tauri.app](https://v2.tauri.app/start/))                                                                                                                                                         |
| Neutralinojs                   | OS webview + built-in updater                                 | No Node runtime for the existing server ([docs](https://neutralino.js.org/docs/))                                                                                                                                                                                                       |
| Wails                          | Go backend, native webview                                    | Go rewrite ([README](https://github.com/wailsapp/wails))                                                                                                                                                                                                                                |
| Electron Forge                 | Official makers/publishers                                    | Publishing/auto-update features in electron-builder only work with it as the primary tool; both reference repos use electron-builder ([electron-forge.md](https://github.com/electron-userland/electron-builder/blob/electron-builder@26.17.0/website/docs/features/electron-forge.md)) |
| update-electron-app            | Zero-config updates via update.electronjs.org                 | macOS and Windows only, macOS must be signed ([repo](https://github.com/electron/update-electron-app))                                                                                                                                                                                  |
| PWA install                    | "Install app" from the hosted page                            | Complementary, not a replacement: no local server; Firefox does not install PWAs ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable))                                                                                              |
| **electron-builder + updater** | Every target the issue asks for, GitHub releases, auto-update | **Chosen**: already an optional peer of this repo, used by both reference repositories                                                                                                                                                                                                  |

## 8. Landing and download pages

- `GET /repos/{owner}/{repo}/releases/latest` returns the newest
  non-draft, non-prerelease release
  ([REST docs](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)).
  The API allows CORS from any origin, and unauthenticated calls are
  limited to 60 per hour per IP
  ([CORS docs](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests),
  [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
- `releases/latest/download/<name>` redirects only work when asset names
  do not change between versions; with versioned names a missing asset
  is only detected after the redirect (checked with curl on
  docker/compose). The landing page therefore reads the release list
  through the API (one request per visit, cached in `sessionStorage`),
  picks the newest release that actually carries desktop assets (the
  desktop build attaches them minutes after the release is created) and
  falls back to the plain Releases page when the API is unavailable.
