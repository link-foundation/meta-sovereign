/**
 * Desktop packaging helpers (issue #37): the staged package.json, the
 * electron-builder config, Linux artifact-name normalization and the
 * release asset validation. Together they guarantee that every file
 * the release workflow uploads has the name the download page links to.
 */

import { describe, it, expect } from 'test-anywhere';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DESKTOP_ENTRY_NAME,
  desktopPackageJson,
} from '../scripts/prepare-desktop.mjs';
import {
  normalizeArtifactName,
  normalizeDesktopArtifacts,
  normalizeUpdateFeed,
} from '../scripts/normalize-desktop-artifacts.mjs';
import {
  checksummedNames,
  validateDesktopAssets,
} from '../scripts/validate-desktop-assets.mjs';
import { newestVersion } from '../scripts/build-desktop.mjs';
import {
  DOWNLOAD_OPTIONS,
  assetNameFor,
  expectedReleaseAssets,
} from '../src/web/download/downloads.js';

const require = createRequire(import.meta.url);
const builderConfig = require('../../desktop/electron-builder.config.cjs');
const rootPkg = require('../../package.json');

const VERSION = '1.2.3';

// The `${arch}` spellings electron-builder uses per target.
const ARCH_SPELLINGS = {
  appimage: { x64: 'x86_64', arm64: 'arm64' },
  deb: { x64: 'amd64', arm64: 'arm64' },
  tar: { x64: 'x64', arm64: 'arm64' },
};

const templateFor = (opt) => {
  if (opt.os === 'linux') {
    return builderConfig.linux.artifactName;
  }
  if (opt.os === 'macos') {
    return opt.format === 'dmg'
      ? builderConfig.dmg.artifactName
      : builderConfig.mac.artifactName;
  }
  return opt.format === 'installer'
    ? builderConfig.nsis.artifactName
    : builderConfig.portable.artifactName;
};

const expand = (template, { arch, ext }) =>
  template
    .replaceAll('${arch}', arch)
    .replaceAll('${version}', VERSION)
    .replaceAll('${ext}', ext);

describe('desktop package.json', () => {
  it('ships the root version with electron-updater as the only dependency', () => {
    const pkg = desktopPackageJson(rootPkg);
    expect(pkg.version).toBe(rootPkg.version);
    expect(pkg.main).toBe('js/electron/main.js');
    expect(pkg.type).toBe('module');
    expect(pkg.private).toBe(true);
    expect(Object.keys(pkg.dependencies)).toEqual(['electron-updater']);
    expect(pkg.dependencies['electron-updater']).toBe(
      rootPkg.peerDependencies['electron-updater']
    );
    expect(pkg.devDependencies).toBe(undefined);
  });

  it('names the .desktop entry after the executable', () => {
    const pkg = desktopPackageJson(rootPkg);
    expect(pkg.desktopName).toBe(DESKTOP_ENTRY_NAME);
    expect(DESKTOP_ENTRY_NAME).toBe(`${builderConfig.executableName}.desktop`);
    expect(builderConfig.linux.syncDesktopName).toBe(undefined);
  });
});

describe('electron-builder config', () => {
  it('uses the v27 schema while preserving files, native and signing settings', () => {
    expect(builderConfig.files).toBe(undefined);
    expect(builderConfig.fileOptions.files).toEqual([
      'js/**/*',
      'package.json',
      'LICENSE',
      'README.md',
    ]);
    expect(builderConfig.npmRebuild).toBe(undefined);
    expect(builderConfig.nativeModules.npmRebuild).toBe(false);
    expect(builderConfig.mac.sign.hardenedRuntime).toBe(true);
    expect(builderConfig.mac.sign.entitlements).toContain(
      'entitlements.mac.plist'
    );
    expect(builderConfig.mac.sign.entitlementsInherit).toBe(
      builderConfig.mac.sign.entitlements
    );
    // Preserve the existing unsigned-manifest update channel for updater 6.
    expect(builderConfig.updateManifest).toBe(false);
    expect(builderConfig.win.verifyUpdateCodeSignature).toBe(false);
  });

  it('keeps the reverse-DNS app id and GitHub publish target', () => {
    expect(builderConfig.appId).toBe('foundation.link.meta.sovereign');
    expect(builderConfig.publish[0]).toEqual({
      provider: 'github',
      owner: 'link-foundation',
      repo: 'meta-sovereign',
      releaseType: 'release',
    });
  });

  it('names the macOS bundle after the product, not the executable', () => {
    // electron-builder names the .app after `mac.executableName`,
    // falling back to the top-level (Linux/Windows) `meta-sovereign`.
    expect(builderConfig.mac.executableName).toBe(builderConfig.productName);
    expect(builderConfig.executableName).toBe('meta-sovereign');
  });

  it('gives ad-hoc macOS builds an identity, so the sign hook runs', async () => {
    // Without `mac.sign.identity: '-'` electron-builder finds no identity
    // (auto-discovery is off), returns before calling `mac.sign.sign` and
    // ships an unsigned bundle that Apple silicon refuses to open.
    const workflow = await readFile(
      new URL('../../.github/workflows/desktop-release.yml', import.meta.url),
      'utf8'
    );
    const adhoc = workflow
      .split('\n')
      .find((line) => line.includes('adhoc-sign-mac.cjs'));
    expect(adhoc).toContain('-c.mac.sign.identity=-');
    expect(adhoc).toContain('-c.mac.sign.sign=');
    expect(adhoc).toContain('-c.mac.notarize=false');
  });

  it('does not pass removed builder environment overrides to arm64 builds', async () => {
    const workflow = await readFile(
      new URL('../../.github/workflows/desktop-release.yml', import.meta.url),
      'utf8'
    );
    expect(workflow).not.toContain('USE_SYSTEM_FPM');
    expect(workflow).toContain('META_SOVEREIGN_FPM_DIR');
    expect(builderConfig.toolsets).toEqual({});
  });

  it('produces the catalogue name for every download option', () => {
    for (const opt of DOWNLOAD_OPTIONS) {
      const arch =
        opt.os === 'linux' ? ARCH_SPELLINGS[opt.format][opt.arch] : opt.arch;
      const built = expand(templateFor(opt), { arch, ext: opt.extension });
      expect(normalizeArtifactName(built)).toBe(assetNameFor(opt, VERSION));
    }
  });
});

describe('normalize-desktop-artifacts', () => {
  it('maps Linux arch spellings to x64/arm64', () => {
    expect(
      normalizeArtifactName(
        'meta-sovereign-desktop-linux-x86_64-1.2.3.AppImage'
      )
    ).toBe('meta-sovereign-desktop-linux-x64-1.2.3.AppImage');
    expect(
      normalizeArtifactName('meta-sovereign-desktop-linux-amd64-1.2.3.deb')
    ).toBe('meta-sovereign-desktop-linux-x64-1.2.3.deb');
    expect(
      normalizeArtifactName('meta-sovereign-desktop-linux-aarch64-1.2.3.deb')
    ).toBe('meta-sovereign-desktop-linux-arm64-1.2.3.deb');
    const canonical = 'meta-sovereign-desktop-macos-x64-1.2.3.dmg';
    expect(normalizeArtifactName(canonical)).toBe(canonical);
  });

  it('rewrites update feeds', () => {
    const feed = [
      'version: 1.2.3',
      'files:',
      '  - url: meta-sovereign-desktop-linux-x86_64-1.2.3.AppImage',
      'path: meta-sovereign-desktop-linux-x86_64-1.2.3.AppImage',
    ].join('\n');
    expect(normalizeUpdateFeed(feed)).not.toContain('x86_64');
    expect(normalizeUpdateFeed(feed)).toContain(
      'path: meta-sovereign-desktop-linux-x64-1.2.3.AppImage'
    );
  });

  it('renames files and feeds in a release directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meta-sov-desktop-'));
    try {
      const appImage = 'meta-sovereign-desktop-linux-x86_64-1.2.3.AppImage';
      await writeFile(join(dir, appImage), 'binary');
      await writeFile(join(dir, 'latest-linux.yml'), `path: ${appImage}\n`);
      await writeFile(join(dir, 'builder-debug.yml'), `x: ${appImage}\n`);
      const report = await normalizeDesktopArtifacts(dir);
      expect(report.renamed).toEqual([
        [appImage, 'meta-sovereign-desktop-linux-x64-1.2.3.AppImage'],
      ]);
      expect(report.feeds).toEqual(['latest-linux.yml']);
      expect((await readdir(dir)).sort()).toEqual([
        'builder-debug.yml',
        'latest-linux.yml',
        'meta-sovereign-desktop-linux-x64-1.2.3.AppImage',
      ]);
      expect(await readFile(join(dir, 'latest-linux.yml'), 'utf8')).toBe(
        'path: meta-sovereign-desktop-linux-x64-1.2.3.AppImage\n'
      );
      // Idempotent: a second run has nothing to do.
      expect(await normalizeDesktopArtifacts(dir)).toEqual({
        renamed: [],
        feeds: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores a missing directory', async () => {
    const missing = join(tmpdir(), 'meta-sov-desktop-does-not-exist');
    expect(await normalizeDesktopArtifacts(missing)).toEqual({
      renamed: [],
      feeds: [],
    });
  });
});

describe('validate-desktop-assets', () => {
  const sums = (names) =>
    names.map((name) => `${'a'.repeat(64)}  ${name}`).join('\n');

  it('parses sha256sum output, including binary-mode markers', () => {
    expect(
      checksummedNames(
        `${'0'.repeat(64)}  a.dmg\r\n${'f'.repeat(64)} *b.exe\nnot a line\n`
      )
    ).toEqual(['a.dmg', 'b.exe']);
  });

  it('accepts a complete, checksummed release', () => {
    const names = expectedReleaseAssets(VERSION);
    const result = validateDesktopAssets({
      tag: `v${VERSION}`,
      names,
      checksums: sums(names),
    });
    expect(result).toEqual({
      version: VERSION,
      missing: [],
      unchecksummed: [],
    });
  });

  it('reports missing and unchecksummed installers', () => {
    const names = expectedReleaseAssets(VERSION).filter(
      (name) => !name.endsWith('.AppImage')
    );
    const result = validateDesktopAssets({
      tag: `v${VERSION}`,
      names,
      checksums: sums(names.filter((name) => !name.endsWith('.deb'))),
    });
    expect(result.missing.length).toBe(2);
    expect(result.missing.every((name) => name.endsWith('.AppImage'))).toBe(
      true
    );
    expect(result.unchecksummed.length).toBe(4);
  });

  it('rejects tags without a version', () => {
    expect(() => validateDesktopAssets({ tag: 'latest', names: [] })).toThrow();
  });
});

describe('build-desktop', () => {
  it('picks the newest version from npm view output', () => {
    expect(newestVersion('["41.5.0","41.10.7"]')).toBe('41.10.7');
    expect(newestVersion('"41.10.7"')).toBe('41.10.7');
  });
});
