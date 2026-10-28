'use strict';

// electron-builder configuration for the Meta Sovereign desktop app
// (issue #37). It packages the staged app from
// `js/scripts/prepare-desktop.mjs`:
//
//   npm run build:web
//   node js/scripts/prepare-desktop.mjs
//   npx electron-builder --config desktop/electron-builder.config.cjs \
//     --projectDir dist/desktop/app --publish never [--linux|--mac|--win]
//
// Artifact names follow `js/src/web/download/downloads.js` (after
// `js/scripts/normalize-desktop-artifacts.mjs` renames Linux arch
// suffixes such as `x86_64`/`amd64` to `x64`), so the download page,
// the release workflow and electron-builder always agree.
//
// Paths are absolute because electron-builder resolves relative ones
// against `--projectDir` (the staged app), not this file.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const PREFIX = 'meta-sovereign-desktop';

const electronVersion = () => {
  if (process.env.META_SOVEREIGN_ELECTRON_VERSION) {
    return process.env.META_SOVEREIGN_ELECTRON_VERSION;
  }
  try {
    return require(require.resolve('electron/package.json', { paths: [ROOT] }))
      .version;
  } catch {
    // electron-builder falls back to its own detection and errors
    // clearly when electron is missing.
    return undefined;
  }
};

module.exports = {
  appId: 'foundation.link.meta.sovereign',
  productName: 'Meta Sovereign',
  executableName: 'meta-sovereign',
  copyright: 'Unlicense — released into the public domain',
  electronVersion: electronVersion(),
  asar: true,
  // The app has no native modules; electron-updater is pure JS.
  nativeModules: { npmRebuild: false },
  // arm64 CI installs native FPM; v27 config replaces USE_SYSTEM_FPM.
  toolsets: process.env.META_SOVEREIGN_FPM_DIR
    ? {
        fpm: {
          url: pathToFileURL(path.resolve(process.env.META_SOVEREIGN_FPM_DIR))
            .href,
        },
      }
    : {},
  directories: {
    output: path.join(ROOT, 'dist', 'desktop', 'release'),
    buildResources: path.join(ROOT, 'desktop'),
  },
  fileOptions: { files: ['js/**/*', 'package.json', 'LICENSE', 'README.md'] },
  // Retain the existing updater-6 channel; this workflow has no manifest key.
  updateManifest: false,
  publish: [
    {
      provider: 'github',
      owner: 'link-foundation',
      repo: 'meta-sovereign',
      releaseType: 'release',
    },
  ],
  linux: {
    target: ['AppImage', 'deb', 'tar.gz'],
    category: 'Utility',
    // Keep the .desktop entry and the staged package.json `desktopName`
    // (js/scripts/prepare-desktop.mjs) in sync.
    synopsis: 'Local-first personal CRM and unified messenger',
    maintainer: 'Link Foundation <link-foundation@users.noreply.github.com>',
    artifactName: `${PREFIX}-linux-\${arch}-\${version}.\${ext}`,
  },
  mac: {
    // The top-level `executableName` also names the .app bundle, so
    // macOS gets the product name back ("Meta Sovereign.app").
    executableName: 'Meta Sovereign',
    target: ['dmg', 'zip'],
    category: 'public.app-category.productivity',
    extendInfo: {
      NSContactsUsageDescription:
        'Import contacts from this Mac and its synced accounts into your local Meta Sovereign address book, after you review the import.',
    },
    artifactName: `${PREFIX}-macos-\${arch}-\${version}.\${ext}`,
    notarize: true,
    sign: {
      hardenedRuntime: true,
      entitlements: path.join(ROOT, 'desktop', 'entitlements.mac.plist'),
      entitlementsInherit: path.join(ROOT, 'desktop', 'entitlements.mac.plist'),
    },
  },
  dmg: {
    artifactName: `${PREFIX}-macos-\${arch}-\${version}.\${ext}`,
    title: 'Install Meta Sovereign',
  },
  win: {
    // Windows artifacts already ship unsigned (no Authenticode publisher).
    // Keep that channel explicit under v27's fail-closed signing policy.
    verifyUpdateCodeSignature: false,
    target: ['nsis', 'portable'],
  },
  nsis: {
    artifactName: `${PREFIX}-windows-installer-\${arch}-\${version}.\${ext}`,
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  portable: {
    artifactName: `${PREFIX}-windows-portable-\${arch}-\${version}.\${ext}`,
  },
};
