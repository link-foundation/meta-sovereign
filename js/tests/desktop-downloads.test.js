import { describe, it, expect } from 'test-anywhere';
import {
  ARTIFACT_PREFIX,
  CHECKSUM_ASSET_NAME,
  DOWNLOAD_OPTIONS,
  PROVENANCE_ASSET_NAME,
  RELEASES_URL,
  UPDATE_METADATA_ASSETS,
  assetHref,
  assetNameFor,
  detectPlatform,
  detectPlatformPrecise,
  expectedReleaseAssets,
  groupByPlatform,
  missingAssets,
  pickDesktopRelease,
  primaryOptionFor,
  releaseVersion,
  resolveDownloads,
} from '../src/web/download/downloads.js';

// Issue #37: one catalogue drives the landing page, the release
// workflow's asset validation and the electron-builder artifact names.

const asset = (name) => ({
  name,
  size: 1024,
  browser_download_url: `https://github.com/link-foundation/meta-sovereign/releases/download/v1.2.3/${name}`,
});

const fullRelease = (version = '1.2.3', extra = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  assets: expectedReleaseAssets(version).map(asset),
  ...extra,
});

describe('desktop download catalogue', () => {
  it('lists every platform/arch/format the release must carry', () => {
    const names = expectedReleaseAssets('1.2.3');
    expect(names).toContain(
      'meta-sovereign-desktop-windows-installer-x64-1.2.3.exe'
    );
    expect(names).toContain(
      'meta-sovereign-desktop-windows-portable-arm64-1.2.3.exe'
    );
    expect(names).toContain('meta-sovereign-desktop-macos-arm64-1.2.3.dmg');
    expect(names).toContain('meta-sovereign-desktop-macos-x64-1.2.3.zip');
    expect(names).toContain(
      'meta-sovereign-desktop-linux-arm64-1.2.3.AppImage'
    );
    expect(names).toContain('meta-sovereign-desktop-linux-x64-1.2.3.deb');
    expect(names).toContain('meta-sovereign-desktop-linux-x64-1.2.3.tar.gz');
    for (const meta of UPDATE_METADATA_ASSETS) {
      expect(names).toContain(meta);
    }
    expect(names).toContain(CHECKSUM_ASSET_NAME);
    expect(names).toContain(PROVENANCE_ASSET_NAME);
    expect(new Set(names).size).toBe(names.length);
    expect(DOWNLOAD_OPTIONS.length).toBe(14);
  });

  it('keeps option ids unique and names prefixed', () => {
    const ids = DOWNLOAD_OPTIONS.map((opt) => opt.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const opt of DOWNLOAD_OPTIONS) {
      expect(assetNameFor(opt, '0.0.1').startsWith(`${ARTIFACT_PREFIX}-`)).toBe(
        true
      );
    }
  });

  it('reports missing assets', () => {
    const expected = expectedReleaseAssets('1.2.3');
    expect(missingAssets(expected, expected)).toEqual([]);
    const partial = expected.filter((name) => !name.includes('linux'));
    const missing = missingAssets(expected, partial);
    expect(missing.length).toBe(8);
    expect(missing).toContain('latest-linux-arm64.yml');
  });
});

describe('releaseVersion', () => {
  it('extracts the semver from tags and release objects', () => {
    expect(releaseVersion({ tag_name: 'v0.20.0' })).toBe('0.20.0');
    expect(releaseVersion({ tagName: 'meta-sovereign-v1.0.0-rc.1' })).toBe(
      '1.0.0-rc.1'
    );
    expect(releaseVersion('2.3.4')).toBe('2.3.4');
    expect(releaseVersion({ tag_name: 'nightly' })).toBe(null);
    expect(releaseVersion(null)).toBe(null);
  });
});

describe('pickDesktopRelease', () => {
  it('skips drafts, prereleases and releases without desktop assets', () => {
    const fresh = { tag_name: 'v1.3.0', draft: false, assets: [] };
    const draft = fullRelease('1.2.9', { draft: true });
    const pre = fullRelease('1.2.8', { prerelease: true });
    const good = fullRelease('1.2.3');
    expect(pickDesktopRelease([fresh, draft, pre, good])).toBe(good);
    expect(pickDesktopRelease([fresh])).toBe(null);
    expect(pickDesktopRelease(undefined)).toBe(null);
    expect(pickDesktopRelease({ message: 'rate limited' })).toBe(null);
  });
});

describe('resolveDownloads', () => {
  it('maps release assets to links and marks missing ones', () => {
    const release = fullRelease('1.2.3');
    release.assets = release.assets.filter(
      (a) => !a.name.includes('windows-portable-arm64')
    );
    const entries = resolveDownloads(release);
    expect(entries.length).toBe(DOWNLOAD_OPTIONS.length);
    const dmg = entries.find((e) => e.id === 'macos-dmg-arm64');
    expect(dmg.name).toBe('meta-sovereign-desktop-macos-arm64-1.2.3.dmg');
    expect(dmg.href.endsWith(dmg.name)).toBe(true);
    expect(dmg.size).toBe(1024);
    const portable = entries.find((e) => e.id === 'windows-portable-arm64');
    expect(portable.href).toBe(null);
  });

  it('copes with a missing release', () => {
    const entries = resolveDownloads(null);
    expect(entries.every((e) => e.href === null && e.name === null)).toBe(true);
  });

  it('groups entries per platform in a stable order', () => {
    const groups = groupByPlatform(resolveDownloads(fullRelease()));
    expect(groups.map((g) => g.os)).toEqual(['windows', 'macos', 'linux']);
    expect(groups[0].entries.length).toBe(4);
    expect(groups[1].entries.length).toBe(4);
    expect(groups[2].entries.length).toBe(6);
  });

  it('links checksum files, falling back to the releases page', () => {
    const release = fullRelease();
    expect(
      assetHref(release, CHECKSUM_ASSET_NAME).endsWith('SHA256SUMS.txt')
    ).toBe(true);
    expect(assetHref({ assets: [] }, CHECKSUM_ASSET_NAME)).toBe(RELEASES_URL);
  });
});

describe('detectPlatform', () => {
  const nav = (userAgent, platform = '', extra = {}) => ({
    userAgent,
    platform,
    ...extra,
  });

  it('recognises desktop operating systems', () => {
    expect(
      detectPlatform(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32'))
    ).toEqual({ os: 'windows', arch: 'x64' });
    expect(
      detectPlatform(
        nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel')
      )
    ).toEqual({ os: 'macos', arch: 'arm64' });
    expect(
      detectPlatform(nav('Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64'))
    ).toEqual({ os: 'linux', arch: 'x64' });
    expect(
      detectPlatform(nav('Mozilla/5.0 (X11; Linux aarch64)', 'Linux aarch64'))
    ).toEqual({ os: 'linux', arch: 'arm64' });
  });

  it('treats phones and tablets as mobile and unknowns as null', () => {
    expect(
      detectPlatform(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8)'))
    ).toEqual({ os: 'mobile', arch: null });
    expect(
      detectPlatform(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'iPhone'))
    ).toEqual({ os: 'mobile', arch: null });
    expect(detectPlatform({}).os).toBe(null);
    expect(detectPlatform(null).os).toBe(null);
  });

  it('refines the architecture with client hints', async () => {
    const windowsArm = nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '', {
      userAgentData: {
        platform: 'Windows',
        getHighEntropyValues: async () => ({ architecture: 'arm' }),
      },
    });
    expect(await detectPlatformPrecise(windowsArm)).toEqual({
      os: 'windows',
      arch: 'arm64',
    });
    const intelMac = nav('Mozilla/5.0 (Macintosh; Intel Mac OS X)', '', {
      userAgentData: {
        platform: 'macOS',
        getHighEntropyValues: async () => ({ architecture: 'x86' }),
      },
    });
    expect(await detectPlatformPrecise(intelMac)).toEqual({
      os: 'macos',
      arch: 'x64',
    });
    const broken = nav('Mozilla/5.0 (X11; Linux x86_64)', '', {
      userAgentData: {
        platform: 'Linux',
        getHighEntropyValues: async () => {
          throw new Error('denied');
        },
      },
    });
    expect(await detectPlatformPrecise(broken)).toEqual({
      os: 'linux',
      arch: 'x64',
    });
  });
});

describe('primaryOptionFor', () => {
  it('recommends the installer format for each OS', () => {
    expect(primaryOptionFor({ os: 'windows', arch: 'x64' }).id).toBe(
      'windows-installer-x64'
    );
    expect(primaryOptionFor({ os: 'macos', arch: 'arm64' }).id).toBe(
      'macos-dmg-arm64'
    );
    expect(primaryOptionFor({ os: 'linux', arch: 'arm64' }).id).toBe(
      'linux-appimage-arm64'
    );
    expect(primaryOptionFor({ os: 'linux', arch: 'riscv64' }).id).toBe(
      'linux-appimage-x64'
    );
    expect(primaryOptionFor({ os: 'mobile', arch: null })).toBe(null);
    expect(primaryOptionFor()).toBe(null);
  });
});
