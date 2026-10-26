/**
 * Browser session factory for CV plans (R-V14).
 *
 * `browser-commander` and `playwright` are optional dependencies: the
 * model, the diff, the plans and the telemetry all work without a
 * browser, and only an actual read/write run needs one. This module is
 * the single place that knows how to obtain a commander, so the CLI,
 * the server and the tests share one story — including the story we
 * tell when the packages are missing.
 *
 * Every dependency is injectable, which is what lets the unit tests
 * exercise the failure paths (missing package, launch failure, close
 * failure) without downloading a Chromium.
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { defaultStoreDir } from '../storage/app-directory.js';

/** Packages a live run needs, in the order we report them. */
export const BROWSER_PACKAGES = ['browser-commander', 'playwright'];

/** Default persistent profile directory: sessions must survive runs. */
export const defaultProfileDir = (platform = 'shared') =>
  path.join(defaultStoreDir(), 'browser-profiles', platform);

const persistentProfile = async (platform) => {
  const target = defaultProfileDir(platform);
  const legacy = path.join(
    os.homedir(),
    '.meta-sovereign',
    'browser-profiles',
    platform
  );
  const exists = (file) =>
    fs.lstat(file).then(
      () => true,
      () => false
    );
  if (!(await exists(target)) && (await exists(legacy))) {
    if (await exists(path.join(legacy, 'SingletonLock'))) {
      throw Object.assign(
        new Error(
          'Close the existing CV browser before migrating its profile.'
        ),
        { code: 'browser-profile-in-use' }
      );
    }
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.rename(legacy, target);
    try {
      await fs.symlink(
        target,
        legacy,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    } catch (error) {
      await fs.rename(target, legacy);
      throw error;
    }
  }
  return target;
};

const defaultImporters = {
  'browser-commander': () => import('browser-commander'),
  playwright: () => import('playwright'),
};

/**
 * Probe the optional packages without launching anything.
 * @param {{importers?: object}} [options]
 * @returns {Promise<{available: boolean, missing: string[], reason: string|null}>}
 */
export const browserAvailability = async ({ importers = {} } = {}) => {
  const missing = [];
  for (const name of BROWSER_PACKAGES) {
    const load = importers[name] ?? defaultImporters[name];
    try {
      await load();
    } catch {
      missing.push(name);
    }
  }
  return {
    available: missing.length === 0,
    missing,
    reason: missing.length
      ? `missing optional packages: ${missing.join(', ')} (install with \`npm i ${missing.join(' ')}\`)`
      : null,
  };
};

/** Error thrown when a live run is requested without the packages. */
export class BrowserUnavailableError extends Error {
  constructor(missing) {
    super(
      `browser automation unavailable — install ${missing.join(' and ')} to run CV plans against a live site`
    );
    this.name = 'BrowserUnavailableError';
    this.code = 'browser-unavailable';
    this.missing = missing;
  }
}

/**
 * The installed Chrome, started the way a person starts it
 * (browser-commander's default `launch: 'real'`): no `--enable-automation`
 * and no `--disable-blink-features=AutomationControlled`, so Chrome shows
 * no automation bar and a site sees an ordinary browser (working rule
 * 11). Playwright only connects to it. The persistent profile is what
 * keeps the platform session cookie between runs, so a human signs in
 * once per platform.
 */
export const launchWithCommander = async ({
  bc,
  headless,
  profileDir,
  slowMo,
  locale,
  verbose = false,
}) => {
  const session = await bc.launchBrowser({
    engine: 'playwright',
    headless,
    slowMo,
    verbose,
    userDataDir: profileDir,
    args: [`--lang=${locale}`],
  });
  return {
    context: session.browser ?? null,
    page: session.page,
    close: () => (session.close ?? session.browser?.close)?.call(session),
  };
};

/**
 * Open a browser and wrap its page in a browser-commander instance.
 *
 * @param {object} [options]
 * @param {string} [options.platform] platform id, used for the profile dir
 * @param {boolean} [options.headless] default true; sign-in runs want false
 * @param {string} [options.profileDir] persistent user-data directory
 * @param {number} [options.slowMo] ms between actions (debugging)
 * @param {string} [options.locale] browser locale, e.g. `vi-VN`
 * @param {boolean} [options.verbose] browser-commander logging
 * @param {object} [options.importers] injected module loaders (tests)
 * @param {Function} [options.launcher] injected launcher (tests)
 * @returns {Promise<{commander: object, page: object, close: Function}>}
 */
export const openBrowserSession = async ({
  platform = 'shared',
  headless = true,
  profileDir = null,
  slowMo = 0,
  locale = 'en-US',
  verbose = false,
  importers = {},
  launcher = null,
} = {}) => {
  const load = async (name) => {
    const importer = importers[name] ?? defaultImporters[name];
    try {
      return await importer();
    } catch {
      throw new BrowserUnavailableError([name]);
    }
  };
  const bc = await load('browser-commander');
  const session = launcher
    ? await launcher({ headless, profileDir, slowMo, locale })
    : await (async () => {
        // The engine browser-commander drives the real Chrome with.
        await load('playwright');
        return launchWithCommander({
          bc,
          headless,
          profileDir: profileDir ?? (await persistentProfile(platform)),
          slowMo,
          locale,
          verbose,
        });
      })();
  const commander = bc.makeBrowserCommander({
    page: session.page,
    verbose,
    // Navigation and dialog managers install page-level listeners that
    // outlive a plan; CV plans drive navigation explicitly instead.
    enableNetworkTracking: false,
    enableNavigationManager: false,
    enableDialogManager: false,
  });
  return {
    commander,
    page: session.page,
    context: session.context ?? null,
    async close() {
      try {
        await commander.destroy?.();
      } finally {
        await session.close?.();
      }
    },
  };
};

/**
 * Run `fn` with a session and always close it, even on failure.
 * @param {object} options passed to {@link openBrowserSession}
 * @param {(session: object) => Promise<any>} fn
 */
export const withBrowserSession = async (options, fn) => {
  const session = await openBrowserSession(options);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
};
