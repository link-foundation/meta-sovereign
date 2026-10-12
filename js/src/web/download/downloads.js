/**
 * Desktop download catalogue (issue #37) — the single source of truth
 * for desktop release asset names.
 *
 * The same list drives three things, so they can never drift apart:
 *   - the download landing page (`js/src/web/download/`), which maps a
 *     GitHub release to per-platform download buttons;
 *   - `js/scripts/validate-desktop-assets.mjs`, which the desktop
 *     release workflow runs before and after uploading assets;
 *   - `desktop/electron-builder.config.cjs`, whose `artifactName`
 *     templates produce exactly these names (after
 *     `js/scripts/normalize-desktop-artifacts.mjs`).
 *
 * Pure ES module with no DOM or Node imports: it runs in the browser
 * and in Node/Bun/Deno tests alike.
 */

export const REPOSITORY = 'link-foundation/meta-sovereign';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
export const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`;
export const ARTIFACT_PREFIX = 'meta-sovereign-desktop';
export const CHECKSUM_ASSET_NAME = 'SHA256SUMS.txt';
export const PROVENANCE_ASSET_NAME = 'BUILD-PROVENANCE.txt';

/**
 * electron-updater feeds. One `latest-mac.yml` covers both macOS
 * architectures (they are built in one job); Windows has a single
 * `latest.yml`, owned by the x64 build.
 */
export const UPDATE_METADATA_ASSETS = Object.freeze([
  'latest.yml',
  'latest-mac.yml',
  'latest-linux.yml',
  'latest-linux-arm64.yml',
]);

export const PLATFORMS = Object.freeze(['windows', 'macos', 'linux']);

const option = (os, arch, format, extension, family = os) =>
  Object.freeze({
    id: `${os}-${format}-${arch}`,
    os,
    arch,
    format,
    extension,
    assetPrefix: `${ARTIFACT_PREFIX}-${family}-${arch}`,
  });

export const DOWNLOAD_OPTIONS = Object.freeze([
  option('windows', 'x64', 'installer', 'exe', 'windows-installer'),
  option('windows', 'x64', 'portable', 'exe', 'windows-portable'),
  option('windows', 'arm64', 'installer', 'exe', 'windows-installer'),
  option('windows', 'arm64', 'portable', 'exe', 'windows-portable'),
  option('macos', 'arm64', 'dmg', 'dmg'),
  option('macos', 'x64', 'dmg', 'dmg'),
  option('macos', 'arm64', 'zip', 'zip'),
  option('macos', 'x64', 'zip', 'zip'),
  option('linux', 'x64', 'appimage', 'AppImage'),
  option('linux', 'x64', 'deb', 'deb'),
  option('linux', 'x64', 'tar', 'tar.gz'),
  option('linux', 'arm64', 'appimage', 'AppImage'),
  option('linux', 'arm64', 'deb', 'deb'),
  option('linux', 'arm64', 'tar', 'tar.gz'),
]);

/** `v0.20.0` / `meta-sovereign-v0.20.0` / `0.20.0-rc.1` -> semver string. */
export const releaseVersion = (release) => {
  const tag = String(release?.tag_name ?? release?.tagName ?? release ?? '');
  const match = tag.match(
    /(?:^|[-/])v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/
  );
  return match?.[1] ?? null;
};

export const assetNameFor = (opt, version) =>
  `${opt.assetPrefix}-${version}.${opt.extension}`;

/** Every asset a complete desktop release must carry. */
export const expectedReleaseAssets = (version) => [
  ...DOWNLOAD_OPTIONS.map((opt) => assetNameFor(opt, version)),
  ...UPDATE_METADATA_ASSETS,
  CHECKSUM_ASSET_NAME,
  PROVENANCE_ASSET_NAME,
];

/** Names in `expected` that are absent from `actualNames`. */
export const missingAssets = (expected, actualNames) => {
  const have = new Set(actualNames);
  return expected.filter((name) => !have.has(name));
};

const hasDesktopAssets = (release) =>
  (release?.assets ?? []).some((asset) =>
    String(asset?.name ?? '').startsWith(`${ARTIFACT_PREFIX}-`)
  );

/**
 * Newest published, non-prerelease release that already has desktop
 * assets. The npm/GitHub release is created first and the desktop
 * build attaches its assets a few minutes later, so "latest" alone
 * may still be empty.
 */
export const pickDesktopRelease = (releases) =>
  (Array.isArray(releases) ? releases : []).find(
    (release) =>
      release &&
      !release.draft &&
      !release.prerelease &&
      hasDesktopAssets(release)
  ) ?? null;

/**
 * Map a release to download entries: `{ ...option, name, href, size }`
 * with `href: null` for assets this release does not carry.
 */
export const resolveDownloads = (release) => {
  const version = releaseVersion(release);
  const byName = new Map(
    (release?.assets ?? []).map((asset) => [asset.name, asset])
  );
  return DOWNLOAD_OPTIONS.map((opt) => {
    const name = version ? assetNameFor(opt, version) : null;
    const asset = name ? byName.get(name) : undefined;
    return {
      ...opt,
      name,
      href: asset?.browser_download_url ?? null,
      size: asset?.size ?? null,
    };
  });
};

export const assetHref = (release, name) =>
  (release?.assets ?? []).find((asset) => asset.name === name)
    ?.browser_download_url ?? RELEASES_URL;

/**
 * Guess `{ os, arch }` from a navigator-like object. `arch` is only a
 * hint: browsers report x86 on Apple Silicon and many Windows arm64
 * machines, so we default to the most common build for each OS.
 */
export const detectPlatform = (nav = globalThis.navigator) => {
  const platform = String(
    nav?.userAgentData?.platform ?? nav?.platform ?? ''
  ).toLowerCase();
  const ua = String(nav?.userAgent ?? '').toLowerCase();
  const text = `${platform} ${ua}`;
  if (/android|iphone|ipad|ipod/.test(text)) {
    return { os: 'mobile', arch: null };
  }
  let os = null;
  if (/win/.test(text)) {
    os = 'windows';
  } else if (/mac|darwin/.test(text)) {
    os = 'macos';
  } else if (/linux|x11|cros/.test(text)) {
    os = 'linux';
  }
  // Every Mac browser says "Intel", so Apple Silicon (the default for
  // Macs sold since 2020) is the safer guess there.
  const arch = os === 'macos' || /arm|aarch64/.test(text) ? 'arm64' : 'x64';
  return { os, arch };
};

/**
 * Chromium exposes the real CPU architecture through client hints;
 * fall back to `detectPlatform` everywhere else.
 */
export const detectPlatformPrecise = async (nav = globalThis.navigator) => {
  const guess = detectPlatform(nav);
  try {
    const hints = await nav?.userAgentData?.getHighEntropyValues?.([
      'architecture',
      'bitness',
    ]);
    if (hints?.architecture === 'arm') {
      return { ...guess, arch: 'arm64' };
    }
    if (hints?.architecture === 'x86') {
      return { ...guess, arch: 'x64' };
    }
  } catch {
    // client hints are optional
  }
  return guess;
};

const PRIMARY_FORMAT = {
  windows: 'installer',
  macos: 'dmg',
  linux: 'appimage',
};

/** The one-click recommendation for a detected platform. */
export const primaryOptionFor = ({ os, arch } = {}) => {
  const format = PRIMARY_FORMAT[os];
  if (!format) {
    return null;
  }
  return (
    DOWNLOAD_OPTIONS.find(
      (opt) => opt.os === os && opt.format === format && opt.arch === arch
    ) ?? DOWNLOAD_OPTIONS.find((opt) => opt.os === os && opt.format === format)
  );
};

export const groupByPlatform = (entries) =>
  PLATFORMS.map((os) => ({
    os,
    entries: entries.filter((entry) => entry.os === os),
  }));
