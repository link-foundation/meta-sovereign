/**
 * Download landing page logic (issue #37): locale choice, labels,
 * release loading with the sessionStorage cache, the view model and
 * the in-browser SHA-256 check.
 */

import { describe, it, expect } from 'test-anywhere';

import { COPY, LOCALE_NAMES } from '../src/web/download/copy.js';
import {
  LOCALES,
  RELEASE_CACHE_KEY,
  RELEASE_CACHE_TTL_MS,
  SERVER_COMMANDS,
  buildViewModel,
  assetMeta,
  formatSize,
  loadDesktopRelease,
  optionLabel,
  pickLocale,
  translate,
} from '../src/web/download/model.js';
import {
  checksumForFile,
  sha256Hex,
  verifyChecksum,
} from '../src/web/download/verify.js';
import {
  DOWNLOAD_OPTIONS,
  RELEASES_URL,
  assetNameFor,
} from '../src/web/download/downloads.js';
import { availableLocales } from '../src/web/locales/index.js';

const VERSION = '1.2.3';

const releaseWith = (names, extra = {}) => ({
  tag_name: `v${VERSION}`,
  html_url: `${RELEASES_URL}/tag/v${VERSION}`,
  draft: false,
  prerelease: false,
  assets: names.map((name) => ({
    name,
    size: 1024 * 1024,
    browser_download_url: `${RELEASES_URL}/download/v${VERSION}/${name}`,
    uploader: { login: 'github-actions[bot]' },
  })),
  ...extra,
});

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
};

const fetchReturning =
  (body, calls = []) =>
  async (url) => {
    calls.push(url);
    return { ok: true, json: async () => body };
  };

const t = (key, vars) => translate('en', key, vars);

describe('download page copy', () => {
  it('ships the same locales and keys as the SPA', () => {
    expect([...LOCALES]).toEqual(availableLocales.map((l) => l.id));
    const keys = Object.keys(COPY.en).sort();
    for (const { id, label } of availableLocales) {
      expect(Object.keys(COPY[id]).sort()).toEqual(keys);
      expect(LOCALE_NAMES[id]).toBe(label);
    }
  });

  it('keeps the {platform} placeholder in every translation', () => {
    for (const locale of LOCALES) {
      expect(COPY[locale].downloadFor).toContain('{platform}');
    }
  });
});

describe('pickLocale', () => {
  it('prefers ?lang=, then the stored choice, then navigator.languages', () => {
    expect(
      pickLocale({ search: '?lang=hi', stored: 'ru', languages: ['zh-CN'] })
    ).toBe('hi');
    expect(pickLocale({ stored: 'ru', languages: ['zh-CN'] })).toBe('ru');
    expect(pickLocale({ languages: ['de-DE', 'zh-Hans-CN'] })).toBe('zh');
    expect(pickLocale({ search: '?lang=xx', languages: ['fr'] })).toBe('en');
  });
});

describe('labels', () => {
  it('names every download option distinctly', () => {
    const labels = DOWNLOAD_OPTIONS.map((opt) => optionLabel(opt, t));
    expect(new Set(labels).size).toBe(DOWNLOAD_OPTIONS.length);
    expect(labels).toContain('macOS Apple silicon DMG');
    expect(labels).toContain('Windows ARM64 installer');
    expect(labels).toContain('Linux x64 .deb');
  });

  it('interpolates and falls back to English', () => {
    expect(translate('ru', 'downloadFor', { platform: 'Linux' })).toBe(
      'Скачать для Linux'
    );
    expect(translate('xx', 'allReleases')).toBe('All releases');
  });

  it('formats sizes', () => {
    expect(formatSize(0)).toBe('');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(118 * 1024 * 1024)).toBe('118 MB');
    // A card never wraps to a line that starts with "·" or splits "MB".
    expect(assetMeta('a.dmg', 118 * 1024 * 1024)).toBe(
      'a.dmg\u00a0· 118\u00a0MB'
    );
    expect(assetMeta('a.dmg', 0)).toBe('a.dmg');
  });
});

describe('loadDesktopRelease', () => {
  const names = DOWNLOAD_OPTIONS.map((opt) => assetNameFor(opt, VERSION));

  it('skips releases whose desktop build has not attached assets yet', async () => {
    const newest = releaseWith([], { tag_name: 'v1.2.4' });
    const out = await loadDesktopRelease({
      fetchImpl: fetchReturning([newest, releaseWith(names)]),
    });
    expect(out.status).toBe('ready');
    expect(out.release.tag_name).toBe(`v${VERSION}`);
  });

  it('caches the slimmed API answer for ten minutes', async () => {
    const storage = memoryStorage();
    const calls = [];
    const fetchImpl = fetchReturning([releaseWith(names)], calls);
    await loadDesktopRelease({ fetchImpl, storage, now: 1000 });
    await loadDesktopRelease({ fetchImpl, storage, now: 2000 });
    expect(calls.length).toBe(1);
    expect(storage.data.get(RELEASE_CACHE_KEY)).not.toContain('uploader');
    await loadDesktopRelease({
      fetchImpl,
      storage,
      now: 1000 + RELEASE_CACHE_TTL_MS,
    });
    expect(calls.length).toBe(2);
  });

  it('falls back to the releases page on errors and empty answers', async () => {
    const failing = async () => ({ ok: false, status: 403 });
    expect(await loadDesktopRelease({ fetchImpl: failing })).toEqual({
      status: 'fallback',
      release: null,
    });
    const offline = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect((await loadDesktopRelease({ fetchImpl: offline })).status).toBe(
      'fallback'
    );
    expect(
      (await loadDesktopRelease({ fetchImpl: fetchReturning([]) })).status
    ).toBe('fallback');
  });
});

describe('buildViewModel', () => {
  it('recommends the detected platform build and links the checksums', () => {
    const names = [
      ...DOWNLOAD_OPTIONS.map((opt) => assetNameFor(opt, VERSION)),
      'SHA256SUMS.txt',
    ];
    const view = buildViewModel({
      release: releaseWith(names),
      platform: { os: 'windows', arch: 'arm64' },
    });
    expect(view.version).toBe(VERSION);
    expect(view.primary.id).toBe('windows-installer-arm64');
    expect(view.primary.href).toContain(
      'meta-sovereign-desktop-windows-installer-arm64-1.2.3.exe'
    );
    expect(view.checksumsHref).toContain('/SHA256SUMS.txt');
    expect(view.groups.map((group) => group.os)).toEqual([
      'windows',
      'macos',
      'linux',
    ]);
  });

  it('still lists every option without a release', () => {
    const view = buildViewModel({ platform: { os: 'mobile' } });
    expect(view.primary).toBe(null);
    expect(view.releaseUrl).toBe(RELEASES_URL);
    const entries = view.groups.flatMap((group) => group.entries);
    expect(entries.length).toBe(DOWNLOAD_OPTIONS.length);
    expect(entries.every((entry) => entry.href === null)).toBe(true);
  });

  it('offers npm and GitHub commands for the local server', () => {
    expect(SERVER_COMMANDS.npm).toBe('npx meta-sovereign serve');
    expect(SERVER_COMMANDS.github).toBe(
      'npx github:link-foundation/meta-sovereign serve'
    );
  });
});

describe('verify', () => {
  const ABC_SHA256 =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const abc = new TextEncoder().encode('abc');

  it('hashes with WebCrypto', async () => {
    expect(await sha256Hex(abc)).toBe(ABC_SHA256);
  });

  it('finds the line for a file, including binary-mode markers', () => {
    const sums = `${'0'.repeat(64)}  other.exe\r\n${ABC_SHA256.toUpperCase()} *app.dmg\n`;
    expect(checksumForFile(sums, 'app.dmg')).toBe(ABC_SHA256);
    expect(checksumForFile(sums, 'missing.zip')).toBe(null);
  });

  it('reports match, mismatch and missing', async () => {
    const sums = `${ABC_SHA256}  app.dmg\n${'f'.repeat(64)}  bad.dmg\n`;
    expect(
      (await verifyChecksum({ name: 'app.dmg', data: abc, sumsText: sums }))
        .state
    ).toBe('match');
    expect(
      (await verifyChecksum({ name: 'bad.dmg', data: abc, sumsText: sums }))
        .state
    ).toBe('mismatch');
    expect(
      await verifyChecksum({ name: 'x.dmg', data: abc, sumsText: sums })
    ).toEqual({ state: 'missing' });
  });
});
