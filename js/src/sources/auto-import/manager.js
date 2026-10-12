/**
 * Auto-import jobs: one browser session per provider, driven by
 * browser-commander.
 *
 * Lifecycle: launching -> waiting (browser open, listening for
 * downloads) <-> importing -> done | failed | stopped. A job keeps
 * listening after each import because some services split an export
 * into several files; it ends when the user presses "Finish", closes
 * the browser window, or after `idleTimeoutMs` without activity.
 *
 * Browser selection (env, all optional):
 *   MS_BROWSER_CDP_URL     attach to an already running Chrome
 *                          (http://host:9222 or ws://...), e.g. from a
 *                          Docker container or your everyday browser
 *   MS_BROWSER_CHANNEL     chrome | msedge | brave | chromium ...
 *   MS_BROWSER_EXECUTABLE  explicit browser binary
 *   MS_BROWSER_HEADLESS=1  headless (only useful with a signed-in profile)
 *   MS_BROWSER_VERBOSE=1   browser-commander debug logging
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { autoImportRecipes } from './recipes.js';
import {
  importDownloadedFile,
  extractVisibleMessages,
  scrapedRowsToLinks,
} from './files.js';
import { stampSourceLink } from '../index.js';

const ACTIVE = new Set(['launching', 'waiting', 'importing']);
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Can this server drive a browser at all? */
// browser-commander declares node >=22.12.
const MIN_NODE = [22, 12];

export const probeBrowserAutomation = async (
  importer = () => import('browser-commander'),
  nodeVersion = process.versions.node
) => {
  const [major, minor] = String(nodeVersion).split('.').map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    return {
      available: false,
      reason: `browser import needs Node.js ${MIN_NODE.join('.')} or newer (this server runs ${nodeVersion})`,
    };
  }
  try {
    const bc = await importer();
    if (typeof bc.launchBrowser !== 'function') {
      return { available: false, reason: 'browser-commander API mismatch' };
    }
    return { available: true, reason: null };
  } catch (error) {
    return {
      available: false,
      reason: `browser-commander is not installed (${error.message}). Run "npm install" next to the server.`,
    };
  }
};

/**
 * Default launcher. Returns `{ commander, downloads, onClose, close }`.
 * Tests inject a fake with the same shape.
 */
export const launchWithBrowserCommander = async ({
  url,
  userDataDir,
  downloadsDir,
  env = process.env,
}) => {
  const bc = await import('browser-commander');
  const common = {
    engine: 'playwright',
    verbose: env.MS_BROWSER_VERBOSE === '1',
    downloads: { directory: downloadsDir, conflict: 'rename' },
  };
  const cdp = env.MS_BROWSER_CDP_URL;
  const session = cdp
    ? await bc.connectBrowser({
        ...common,
        ...(/^wss?:/.test(cdp) ? { wsEndpoint: cdp } : { cdpEndpoint: cdp }),
      })
    : await bc.launchBrowser({
        ...common,
        headless: env.MS_BROWSER_HEADLESS === '1',
        userDataDir,
        ...(env.MS_BROWSER_CHANNEL ? { channel: env.MS_BROWSER_CHANNEL } : {}),
        ...(env.MS_BROWSER_EXECUTABLE
          ? { executablePath: env.MS_BROWSER_EXECUTABLE }
          : {}),
      });
  // On an attached browser, work in a tab of our own instead of
  // hijacking whatever the user is looking at.
  const page =
    cdp && typeof session.browser?.newPage === 'function'
      ? await session.browser.newPage()
      : session.page;
  const commander = bc.makeBrowserCommander({
    page,
    verbose: common.verbose,
  });
  // The user takes over from here (sign-in, export), so only wait for the
  // document: browser-commander's default URL-stability and network-idle
  // checks add ~35s on pages that keep polling. A failed first load is
  // not fatal - the window stays open for the user to retry.
  const navigationError = await commander
    .goto({
      url,
      waitUntil: 'domcontentloaded',
      waitForStableUrlBefore: false,
      waitForStableUrlAfter: false,
      waitForNetworkIdle: false,
      timeout: 60000,
    })
    .then(() => null)
    .catch((error) => error.message);
  return {
    commander,
    navigationError,
    downloads: session.downloads,
    onClose: (listener) => page.on?.('close', listener),
    close: async () => {
      await commander.destroy?.().catch(() => {});
      if (cdp) {
        await page.close?.().catch(() => {});
      } else {
        await (session.close ?? session.browser?.close)?.call(session);
      }
    },
  };
};

const snapshot = (job) => ({
  id: job.id,
  provider: job.provider,
  state: job.state,
  url: job.url,
  canCapture: job.canCapture,
  imported: job.imported,
  files: job.files.slice(),
  error: job.error,
  startedAt: job.startedAt,
  updatedAt: job.updatedAt,
});

const statusError = (message, status) =>
  Object.assign(new Error(message), { status });

// Never throws: a broken file becomes an error row in the job report.
const importArtifact = async (store, provider, filePath) => {
  try {
    return await importDownloadedFile({ store, provider, filePath });
  } catch (error) {
    return [
      { name: path.basename(filePath), imported: 0, error: error.message },
    ];
  }
};

// Per-provider browser profile + download folder under the store dir.
// Profiles hold the user's provider sessions: owner-only access.
const prepareDirs = async (dataDir, provider) => {
  const base = path.join(dataDir, 'auto-import');
  const userDataDir = path.join(base, 'profiles', provider);
  const downloadsDir = path.join(base, 'downloads', provider);
  await fs.mkdir(userDataDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(downloadsDir, { recursive: true, mode: 0o700 });
  return { userDataDir, downloadsDir };
};

const captureOpenChat = async (store, job, scrape) => {
  const rows = await job.session.commander.evaluate({
    fn: extractVisibleMessages,
    args: [scrape],
  });
  const links = scrapedRowsToLinks(job.provider, rows ?? []);
  for (const link of links) {
    await store.put(stampSourceLink(link, job.provider));
  }
  const chat = links[0]?.chat ?? 'current page';
  return { name: `page: ${chat}`, imported: links.length };
};

export const createAutoImportManager = ({
  store,
  dataDir,
  launcher = launchWithBrowserCommander,
  env = process.env,
  log = null,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
} = {}) => {
  const jobs = new Map();

  const touch = (job, patch = {}) => {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    globalThis.clearTimeout(job.idleTimer);
    if (ACTIVE.has(job.state)) {
      job.idleTimer = globalThis.setTimeout(
        () => finish(job, 'stopped'),
        idleTimeoutMs
      );
      job.idleTimer.unref?.();
    }
    log?.({
      event: 'auto_import',
      id: job.id,
      provider: job.provider,
      ...patch,
    });
  };

  const finish = async (job, state, error = null) => {
    if (!ACTIVE.has(job.state)) {
      return;
    }
    touch(job, { state, ...(error ? { error } : {}) });
    const session = job.session;
    job.session = null;
    await session?.close().catch(() => {});
  };

  const onDownload = async (job, artifact) => {
    if (!ACTIVE.has(job.state) || !artifact?.path) {
      return;
    }
    touch(job, { state: 'importing' });
    const reports = await importArtifact(store, job.provider, artifact.path);
    job.files.push(...reports);
    job.imported += reports.reduce((n, r) => n + r.imported, 0);
    if (job.state === 'importing') {
      touch(job, { state: 'waiting' });
    }
  };

  const launch = async (job) => {
    try {
      const dirs = await prepareDirs(dataDir, job.provider);
      const session = await launcher({
        provider: job.provider,
        url: job.url,
        env,
        ...dirs,
      });
      if (job.state !== 'launching') {
        await session.close().catch(() => {});
        return;
      }
      job.session = session;
      session.downloads?.on?.('completed', (artifact) =>
        onDownload(job, artifact)
      );
      session.onClose?.(() => finish(job, 'done'));
      touch(job, {
        state: 'waiting',
        ...(session.navigationError ? { error: session.navigationError } : {}),
      });
    } catch (error) {
      touch(job, { state: 'failed', error: error.message });
    }
  };

  const activeFor = (provider) =>
    [...jobs.values()].find(
      (job) => job.provider === provider && ACTIVE.has(job.state)
    );

  const requireJob = (id) => {
    const job = jobs.get(id);
    if (!job) {
      throw statusError(`unknown auto-import job "${id}"`, 404);
    }
    return job;
  };

  return {
    start(provider) {
      const recipe = autoImportRecipes[provider];
      if (!recipe) {
        throw statusError(`no auto-import recipe for "${provider}"`, 400);
      }
      const existing = activeFor(provider);
      if (existing) {
        return snapshot(existing);
      }
      const now = new Date().toISOString();
      const job = {
        id: randomUUID(),
        provider,
        state: 'launching',
        url: recipe.url,
        canCapture: Boolean(recipe.scrape),
        imported: 0,
        files: [],
        error: null,
        startedAt: now,
        updatedAt: now,
        session: null,
        idleTimer: null,
      };
      jobs.set(job.id, job);
      touch(job, { state: 'launching' });
      job.ready = launch(job);
      return snapshot(job);
    },

    get: (id) => snapshot(requireJob(id)),

    list: () => [...jobs.values()].map(snapshot),

    /** Read the messages of the chat open in the browser right now. */
    async capture(id) {
      const job = requireJob(id);
      const recipe = autoImportRecipes[job.provider];
      if (!recipe.scrape) {
        throw statusError(`${job.provider} has no page capture`, 400);
      }
      if (!job.session) {
        throw statusError('the browser for this job is not open', 409);
      }
      touch(job, { state: 'importing' });
      try {
        const report = await captureOpenChat(store, job, recipe.scrape);
        job.files.push(report);
        job.imported += report.imported;
        return snapshot(job);
      } finally {
        if (job.state === 'importing') {
          touch(job, { state: 'waiting' });
        }
      }
    },

    async stop(id) {
      const job = requireJob(id);
      await finish(job, 'done');
      return snapshot(job);
    },

    async close() {
      await Promise.all(
        [...jobs.values()].map((job) => finish(job, 'stopped'))
      );
    },
  };
};
