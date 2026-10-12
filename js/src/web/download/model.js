/**
 * Download landing page logic (issue #37) without the DOM: locale
 * choice, labels, release loading and the view model `page.js`
 * renders. Pure ES module, so the tests run it under Node, Bun and
 * Deno.
 */

import { COPY } from './copy.js';
import {
  CHECKSUM_ASSET_NAME,
  PROVENANCE_ASSET_NAME,
  RELEASES_API,
  RELEASES_URL,
  assetHref,
  groupByPlatform,
  pickDesktopRelease,
  primaryOptionFor,
  releaseVersion,
  resolveDownloads,
} from './downloads.js';

export const LOCALES = Object.freeze(Object.keys(COPY));
export const DEFAULT_LOCALE = 'en';
/** Shared with the SPA (`js/src/web/i18n.js`), so one choice sticks. */
export const LOCALE_STORAGE_KEY = 'metaSovereignLocale';
export const RELEASE_CACHE_KEY = 'metaSovereignDesktopReleases';
export const RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;

export const SERVER_COMMANDS = Object.freeze({
  npm: 'npx meta-sovereign serve',
  github: 'npx github:link-foundation/meta-sovereign serve',
});

export const MACOS_QUARANTINE_COMMAND =
  'xattr -dr com.apple.quarantine "/Applications/Meta Sovereign.app"';

const matchLocale = (tag) => {
  const base = String(tag ?? '')
    .toLowerCase()
    .split(/[-_]/)[0];
  return LOCALES.includes(base) ? base : null;
};

/** `?lang=` beats the stored choice, which beats the browser languages. */
export const pickLocale = ({ search = '', stored = null, languages = [] }) => {
  const fromQuery = new URLSearchParams(search).get('lang');
  for (const candidate of [fromQuery, stored, ...languages]) {
    const locale = matchLocale(candidate);
    if (locale) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
};

export const translate = (locale, key, vars = {}) => {
  const template = COPY[locale]?.[key] ?? COPY[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
};

const FORMAT_LABELS = {
  dmg: 'DMG',
  zip: 'ZIP',
  appimage: 'AppImage',
  deb: '.deb',
  tar: 'tar.gz',
};

/** "macOS Apple silicon", "Windows ARM64", "Linux x64". */
export const platformLabel = ({ os, arch }, t) => {
  if (os === 'macos') {
    return `${t('macos')} ${t(arch === 'arm64' ? 'appleSilicon' : 'intel')}`;
  }
  return `${t(os)} ${arch === 'arm64' ? 'ARM64' : 'x64'}`;
};

/** "Windows x64 installer", "macOS Intel DMG", "Linux ARM64 .deb". */
export const optionLabel = (opt, t) =>
  `${platformLabel(opt, t)} ${
    FORMAT_LABELS[opt.format] ?? t(opt.format)
  }`.trim();

export const formatSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 1)} ${units[unit]}`;
};

// "file · size" for a download card. The file name may wrap anywhere,
// but "·" stays after the name and "115 MB" stays whole, so a line
// never starts with the separator or splits a number from its unit.
export const assetMeta = (name, bytes) =>
  [name, formatSize(bytes).replace(' ', '\u00a0')]
    .filter(Boolean)
    .join('\u00a0· ');

const readCache = (storage, now) => {
  try {
    const cached = JSON.parse(storage?.getItem?.(RELEASE_CACHE_KEY) ?? 'null');
    if (cached && now - cached.at < RELEASE_CACHE_TTL_MS) {
      return cached.releases;
    }
  } catch {
    // a corrupt cache is just a cache miss
  }
  return null;
};

const writeCache = (storage, now, releases) => {
  try {
    storage?.setItem?.(
      RELEASE_CACHE_KEY,
      JSON.stringify({ at: now, releases })
    );
  } catch {
    // quota or privacy mode: skip caching
  }
};

// Only the fields the page reads, so the cache stays small.
const slimRelease = (release) => ({
  tag_name: release.tag_name,
  html_url: release.html_url,
  draft: release.draft,
  prerelease: release.prerelease,
  published_at: release.published_at,
  assets: (release.assets ?? []).map(
    ({ name, size, browser_download_url }) => ({
      name,
      size,
      browser_download_url,
    })
  ),
});

/**
 * Fetch the newest release with desktop assets. The unauthenticated
 * GitHub API allows 60 requests per hour per IP, so results are
 * cached in sessionStorage for ten minutes.
 * @returns {Promise<{status: 'ready'|'fallback', release: object|null}>}
 */
export const loadDesktopRelease = async ({
  fetchImpl = globalThis.fetch,
  storage = null,
  now = Date.now(),
} = {}) => {
  let releases = readCache(storage, now);
  if (!releases) {
    try {
      const response = await fetchImpl(RELEASES_API, {
        headers: { accept: 'application/vnd.github+json' },
      });
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`);
      }
      const body = await response.json();
      releases = (Array.isArray(body) ? body : []).map(slimRelease);
      writeCache(storage, now, releases);
    } catch {
      return { status: 'fallback', release: null };
    }
  }
  const release = pickDesktopRelease(releases);
  return release
    ? { status: 'ready', release }
    : { status: 'fallback', release: null };
};

/** Everything `page.js` needs to render, for one release and platform. */
export const buildViewModel = ({ release = null, platform = {} } = {}) => {
  const entries = resolveDownloads(release);
  const primaryOption = primaryOptionFor(platform);
  const primary = primaryOption
    ? entries.find((entry) => entry.id === primaryOption.id)
    : null;
  return {
    version: releaseVersion(release),
    tag: release?.tag_name ?? null,
    releaseUrl: release?.html_url ?? RELEASES_URL,
    primary,
    groups: groupByPlatform(entries),
    checksumsHref: release
      ? assetHref(release, CHECKSUM_ASSET_NAME)
      : RELEASES_URL,
    provenanceHref: release
      ? assetHref(release, PROVENANCE_ASSET_NAME)
      : RELEASES_URL,
  };
};
