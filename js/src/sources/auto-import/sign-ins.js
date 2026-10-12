/**
 * Reuse the sign-ins the user already has in their own browsers.
 *
 * "Import with browser" opens each service in a dedicated browser profile,
 * so the user would otherwise sign in to every service again. With
 * browser-commander this module can:
 *
 *   scan()        list every installed browser profile (Chrome, Safari,
 *                 Firefox, Edge, Brave, Arc, Yandex, …) and count, per
 *                 service, the cookies it holds. Only host names are read,
 *                 never cookie values.
 *   importFrom()  on the user's explicit request, read the cookies of the
 *                 chosen profiles, keep only the services' own sites and
 *                 save them privately (owner-only file) until the next
 *                 import window for that service is opened.
 *   peek/consume  the import window seeds those cookies once, then the
 *                 copy is deleted: the dedicated profile keeps the session.
 *
 * Everything is read-only for the source browsers and stays on this
 * computer. Cookie values are never logged and never sent to the app;
 * the app only sees counts and browser names.
 *
 * macOS protects Safari's data (and some other browsers' files) behind
 * Full Disk Access. access() reports whether this server process has it
 * and openFullDiskAccessSettings() opens the right System Settings pane.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { autoImportRecipes } from './recipes.js';

export const FULL_DISK_ACCESS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

const BROWSER_NAMES = {
  chrome: 'Google Chrome',
  'chrome-beta': 'Chrome Beta',
  'chrome-dev': 'Chrome Dev',
  'chrome-canary': 'Chrome Canary',
  chromium: 'Chromium',
  edge: 'Microsoft Edge',
  brave: 'Brave',
  vivaldi: 'Vivaldi',
  opera: 'Opera',
  'opera-gx': 'Opera GX',
  yandex: 'Yandex Browser',
  arc: 'Arc',
  firefox: 'Firefox',
  'firefox-developer': 'Firefox Developer Edition',
  librewolf: 'LibreWolf',
  zen: 'Zen',
  safari: 'Safari',
  'safari-technology-preview': 'Safari Technology Preview',
  duckduckgo: 'DuckDuckGo',
};

// Apps that can hold Full Disk Access on behalf of this server process.
const APP_NAMES = {
  'com.apple.Terminal': 'Terminal',
  Apple_Terminal: 'Terminal',
  'com.googlecode.iterm2': 'iTerm',
  'iTerm.app': 'iTerm',
  'com.microsoft.VSCode': 'Visual Studio Code',
  vscode: 'Visual Studio Code',
  'dev.warp.Warp-Stable': 'Warp',
  WarpTerminal: 'Warp',
  ghostty: 'Ghostty',
  'com.mitchellh.ghostty': 'Ghostty',
};

export const browserName = (id) =>
  BROWSER_NAMES[id] ?? `${id.charAt(0).toUpperCase()}${id.slice(1)}`;

/** The app macOS asks about: the terminal or app that started us. */
export const hostAppName = (env = process.env, execPath = process.execPath) => {
  const id = env.__CFBundleIdentifier || env.TERM_PROGRAM;
  return (id && (APP_NAMES[id] ?? id)) || execPath;
};

const isAccessError = (message) =>
  /EPERM|EACCES|Full Disk Access|Operation not permitted/i.test(
    String(message ?? '')
  );

/** Same rule as browser-commander: a host or its subdomains. */
export const onDomains = (host, domains) => {
  const h = String(host ?? '')
    .replace(/^\./, '')
    .toLowerCase();
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
};

const servicesFor = (recipes) =>
  Object.entries(recipes)
    .filter(([, recipe]) => recipe.domains?.length)
    .map(([provider, recipe]) => ({ provider, domains: recipe.domains }));

const statusError = (message, status) =>
  Object.assign(new Error(message), { status });

const cookieKey = (c) => `${c.name}\u0000${c.domain}\u0000${c.path ?? '/'}`;

// Session cookies (expires -1/0) outrank nothing; later expiry wins.
const expiryOf = (c) =>
  Number(c.expires) > 0 ? Number(c.expires) : Number.MAX_SAFE_INTEGER - 1;

const mergeCookies = (existing, incoming, nowSeconds) => {
  const byKey = new Map(existing.map((c) => [cookieKey(c), c]));
  for (const cookie of incoming) {
    if (Number(cookie.expires) > 0 && Number(cookie.expires) < nowSeconds) {
      continue;
    }
    const key = cookieKey(cookie);
    const current = byKey.get(key);
    if (!current || expiryOf(cookie) >= expiryOf(current)) {
      byKey.set(key, cookie);
    }
  }
  return [...byKey.values()];
};

/** Does this process have macOS Full Disk Access (null: unknown)? */
const probeFullDiskAccess = async ({ platform, homeDir, env }) => {
  const app = hostAppName(env);
  if (platform !== 'darwin') {
    return { required: false, granted: true, app };
  }
  try {
    // Safari's folder is the canonical Full-Disk-Access-only path.
    await fs.readdir(path.join(homeDir, 'Library', 'Safari'));
    return { required: true, granted: true, app };
  } catch (error) {
    const denied = error.code === 'EPERM' || error.code === 'EACCES';
    return { required: true, granted: denied ? false : null, app };
  }
};

const profileLabel = (p) =>
  p.displayName && p.displayName !== p.name
    ? `${browserName(p.browser)} (${p.displayName})`
    : browserName(p.browser);

const countServices = (byDomain, services) =>
  Object.fromEntries(
    services
      .map(({ provider, domains }) => [
        provider,
        domains.reduce((n, d) => n + Number(byDomain?.[d] ?? 0), 0),
      ])
      .filter(([, n]) => n > 0)
  );

// One browser profile in the scan: names and counts, never values.
const scanRow = (profile, sources, services) => {
  const source = sources.find(
    (s) => s.browser === profile.browser && s.profile === profile.name
  );
  const error = profile.error ?? source?.error ?? null;
  return {
    browser: profile.browser,
    profile: profile.name,
    label: profileLabel(profile),
    isDefault: Boolean(profile.isDefault),
    services: countServices(source?.byDomain, services),
    error: error ? String(error) : null,
    needsFullDiskAccess: isAccessError(error),
  };
};

// The profile's cookies, or null with the reason added to `errors`.
const readCookies = async (bc, profile, label, errors) => {
  try {
    return await bc.readBrowserCookies({
      browser: profile.browser,
      profile: profile.name,
      cache: false,
      ignoreDecryptionErrors: true,
    });
  } catch (error) {
    errors.push({
      browser: profile.browser,
      profile: profile.name,
      label,
      error: error.message,
      needsFullDiskAccess: isAccessError(error.message),
    });
    return null;
  }
};

export const createSignIns = ({
  dataDir,
  recipes = autoImportRecipes,
  importer = () => import('browser-commander'),
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
  openUrl = (url) =>
    new Promise((resolve, reject) =>
      execFile('open', [url], (error) => (error ? reject(error) : resolve()))
    ),
  now = () => Date.now(),
} = {}) => {
  const dir = path.join(dataDir, 'auto-import', 'sign-ins');
  const services = servicesFor(recipes);
  const allDomains = [...new Set(services.flatMap((s) => s.domains))];
  const fileOf = (provider) => {
    if (!recipes[provider]) {
      throw statusError(`unknown service "${provider}"`, 400);
    }
    return path.join(dir, `${provider}.json`);
  };

  const readSeed = async (provider) => {
    try {
      return JSON.parse(await fs.readFile(fileOf(provider), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  };

  const writeSeed = async (provider, seed) => {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = fileOf(provider);
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(seed), { mode: 0o600 });
    await fs.rename(temp, file);
  };

  const access = () => probeFullDiskAccess({ platform, homeDir, env });

  return {
    access,

    /** Browsers, profiles and per-service cookie counts. No values. */
    async scan() {
      const bc = await importer();
      const [profiles, sources] = await Promise.all([
        bc.listBrowserProfiles(),
        bc.listCookieSources({ domains: allDomains }),
      ]);
      const browsers = profiles.map((p) => scanRow(p, sources, services));
      return { browsers, fullDiskAccess: await access() };
    },

    /**
     * Copy the services' sign-in cookies from the chosen profiles.
     * `sources`: [{browser, profile}] as returned by scan().
     */
    async importFrom(sources = []) {
      if (!Array.isArray(sources) || sources.length === 0) {
        throw statusError('choose at least one browser', 400);
      }
      const bc = await importer();
      const known = await bc.listBrowserProfiles();
      const result = { services: {}, errors: [] };
      const nowSeconds = now() / 1000;
      for (const { browser, profile } of sources) {
        const match = known.find(
          (p) => p.browser === browser && p.name === profile
        );
        if (!match) {
          result.errors.push({ browser, profile, error: 'not found' });
          continue;
        }
        const label = profileLabel(match);
        const cookies = await readCookies(bc, match, label, result.errors);
        if (!cookies) {
          continue;
        }
        for (const { provider, domains } of services) {
          const own = cookies.filter((c) => onDomains(c.domain, domains));
          if (own.length === 0) {
            continue;
          }
          const seed = (await readSeed(provider)) ?? { cookies: [], from: [] };
          const merged = mergeCookies(seed.cookies, own, nowSeconds);
          const from = [...new Set([...seed.from, label])];
          await writeSeed(provider, {
            cookies: merged,
            from,
            importedAt: new Date(now()).toISOString(),
          });
          result.services[provider] = { cookies: merged.length, from };
        }
      }
      return result;
    },

    /** Pending sign-ins per service: counts and sources only. */
    async summary() {
      const out = {};
      for (const { provider } of services) {
        const seed = await readSeed(provider).catch(() => null);
        if (seed?.cookies?.length) {
          out[provider] = {
            cookies: seed.cookies.length,
            from: seed.from,
            importedAt: seed.importedAt,
          };
        }
      }
      return out;
    },

    /** Cookies to seed into the next import window for `provider`. */
    async peek(provider) {
      return (await readSeed(provider))?.cookies ?? [];
    },

    /** The window took them: the dedicated profile keeps the session. */
    async consume(provider) {
      await fs.rm(fileOf(provider), { force: true });
    },

    async openFullDiskAccessSettings() {
      if (platform !== 'darwin') {
        throw statusError('Full Disk Access is a macOS setting', 400);
      }
      await openUrl(FULL_DISK_ACCESS_URL);
      return access();
    },
  };
};
