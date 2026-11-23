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
import { autoImportRecipes, canCaptureRecipe } from './recipes.js';
import {
  importDownloadedFile,
  extractVisibleMessages,
  scrapedRowsToLinks,
} from './files.js';
import { stampSourceLink } from '../index.js';
import { browserName, resolveBrowserPolicy } from '../../browser/policy.js';
import { slotProfileDir } from '../../cv/browser.js';
import { prepareBrowserExecutable } from '../../browser/preparation.js';

const ACTIVE = new Set(['launching', 'waiting', 'importing']);
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Can this server drive a browser at all? */
// browser-commander declares node >=22.12.
const MIN_NODE = [22, 12];
const usesManagedBrowser = (env) =>
  ![
    env.MS_BROWSER_CDP_URL,
    env.MS_BROWSER_CHANNEL,
    env.MS_BROWSER_EXECUTABLE,
  ].some(Boolean);
const prepareManagedBrowser = async (env, prepare, signal) => {
  if (usesManagedBrowser(env)) {
    await prepare({ signal });
  }
  signal?.throwIfAborted();
};

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
 * Default launcher. Returns `{ commander, page, downloads, onClose, close }`.
 * Tests inject a fake with the same shape.
 */
export const launchWithBrowserCommander = async ({
  url,
  userDataDir,
  downloadsDir,
  cookies = [],
  env = process.env,
  headless = env.MS_BROWSER_HEADLESS === '1',
  prepare = prepareBrowserExecutable,
  loadCommander = () => import('browser-commander'),
  signal,
}) => {
  const bc = await loadCommander();
  const common = {
    engine: 'playwright',
    verbose: env.MS_BROWSER_VERBOSE === '1',
    downloads: { directory: downloadsDir, conflict: 'rename' },
  };
  const cdp = env.MS_BROWSER_CDP_URL;
  await prepareManagedBrowser(env, prepare, signal);
  const session = cdp
    ? await bc.connectBrowser({
        ...common,
        ...(/^wss?:/.test(cdp) ? { wsEndpoint: cdp } : { cdpEndpoint: cdp }),
      })
    : await bc.launchBrowser({
        ...common,
        headless,
        userDataDir,
        // Sign-ins the user chose to bring over from their own browsers.
        ...(cookies.length ? { storageState: { cookies, origins: [] } } : {}),
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
    page,
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
  slot: job.slot,
  state: job.state,
  url: job.url,
  canCapture: job.canCapture,
  signedIn: job.signedIn,
  imported: job.imported,
  ...(job.historyCapture ? { historyCapture: job.historyCapture } : {}),
  files: job.files.slice(),
  error: job.error,
  startedAt: job.startedAt,
  updatedAt: job.updatedAt,
});

const newJob = (provider, slot, recipe) => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    provider,
    slot,
    state: 'launching',
    url: recipe.url,
    canCapture: canCaptureRecipe(recipe),
    imported: 0,
    files: [],
    error: null,
    startedAt: now,
    updatedAt: now,
    signedIn: false,
    session: null,
    pendingDownloads: 0,
    idleTimer: null,
    controller: new AbortController(),
  };
};

const statusError = (message, status, code) =>
  Object.assign(new Error(message), { status, code });

// Never throws: a broken file becomes an error row in the job report.
const importArtifact = async (store, provider, filePath, options = {}) => {
  try {
    return await importDownloadedFile({
      store,
      provider,
      filePath,
      ...options,
    });
  } catch (error) {
    return [
      { name: path.basename(filePath), imported: 0, error: error.message },
    ];
  }
};

// Per-provider browser profile + download folder under the store dir.
// Profiles hold the user's provider sessions: owner-only access.
const prepareDirs = async (dataDir, provider, slot) => {
  const base = path.join(dataDir, 'auto-import');
  const userDataDir = slotProfileDir(
    path.join(base, 'profiles', provider),
    slot
  );
  const downloadsDir = slotProfileDir(
    path.join(base, 'downloads', provider),
    slot
  );
  await fs.mkdir(userDataDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(downloadsDir, { recursive: true, mode: 0o700 });
  return { userDataDir, downloadsDir };
};

// Opens the provider's window, seeded once with the sign-ins the user
// chose to bring over from their own browsers (./sign-ins.js).
const openSession = async (job, { launcher, signIns, dataDir, env, store }) => {
  const dirs = await prepareDirs(dataDir, job.provider, job.slot);
  const policy = await resolveBrowserPolicy(store, {
    platform: job.provider,
    useCase: 'auto-import',
    slot: job.slot,
    headless: ['0', '1'].includes(env.MS_BROWSER_HEADLESS)
      ? env.MS_BROWSER_HEADLESS === '1'
      : undefined,
  });
  const cookies = (await signIns?.peek(job.provider)) ?? [];
  const session = await launcher({
    provider: job.provider,
    headless: policy.headless,
    url: job.url,
    env,
    cookies,
    ...dirs,
    signal: job.controller.signal,
  });
  if (cookies.length) {
    await signIns.consume(job.provider);
    job.signedIn = true;
  }
  return session;
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

const captureJob = async (store, job, touch, { history = false }) => {
  const recipe = autoImportRecipes[job.provider];
  if (typeof history !== 'boolean') {
    throw statusError(
      'history must be true or false',
      400,
      'auto-import-history-invalid'
    );
  }
  if (history && !recipe.canCaptureHistory) {
    throw statusError(
      'This provider cannot capture older messages',
      400,
      'auto-import-history-unavailable'
    );
  }
  if (!job.canCapture) {
    throw statusError(`${job.provider} has no page capture`, 400);
  }
  if (!job.session || !ACTIVE.has(job.state)) {
    throw statusError('the browser for this job is not open', 409);
  }
  if (job.state !== 'waiting' || job.reading) {
    throw statusError('the browser is already importing', 409);
  }
  job.scanningHistory = history;
  touch(job, { state: 'importing' });
  try {
    job.capturing = recipe.capture
      ? recipe.capture(store, job.session, {
          signal: job.controller.signal,
          history,
        })
      : captureOpenChat(store, job, recipe.scrape);
    const report = await job.capturing;
    if (history) {
      job.historyCapture = report;
    }
    job.files.push(report);
    job.imported += report.imported;
  } finally {
    job.scanningHistory = false;
    job.capturing = null;
    if (job.state === 'importing' && !job.pendingDownloads) {
      touch(job, { state: 'waiting' });
    }
  }
  return snapshot(job);
};

/** Keep a read receipt in the owner's currently open import browser. */
const readOpenHhImport = async (job, work, touch) => {
  if (!job) {
    return undefined;
  }
  if (job.state !== 'waiting' || !job.session || job.reading) {
    throw Object.assign(
      statusError(
        'The HeadHunter import browser is busy',
        409,
        'hh-import-busy'
      ),
      { fallback: false, read: false }
    );
  }
  job.reading = Promise.resolve().then(() => work(job.session));
  touch(job);
  try {
    return await job.reading;
  } finally {
    job.reading = null;
  }
};

// Imports one downloaded file into the job, growing its counts live and
// surfacing an aborted (store write failed) import as the job's error.
const importInto = async (store, dataDir, job, filePath, touch) => {
  const reports = await importArtifact(store, job.provider, filePath, {
    mediaDir: dataDir ? path.join(dataDir, 'media') : null,
    onProgress: progressOf(job, touch),
  });
  job.files.push(...reports);
  const stopped = reports.find((r) => r.aborted);
  if (stopped) {
    touch(job, { error: stopped.error });
  }
};

// Counts grow while a big archive imports (R-Z10).
const progressOf = (job, touch) => {
  const seen = new Map();
  return ({ name, imported }) => {
    job.imported += imported - (seen.get(name) ?? 0);
    seen.set(name, imported);
    touch(job);
  };
};

export const createAutoImportManager = ({
  store,
  dataDir,
  launcher = launchWithBrowserCommander,
  signIns = null,
  env = process.env,
  log = null,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
} = {}) => {
  const jobs = new Map();
  const deps = { launcher, signIns, dataDir, env, store };

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

  const finish = (job, state, error = null) => {
    if (job.finishing) {
      return job.finishing;
    }
    if (!ACTIVE.has(job.state)) {
      return Promise.resolve();
    }
    touch(job, { state, ...(error ? { error } : {}) });
    job.controller.abort();
    job.finishing = (async () => {
      await job.ready;
      const session = job.session;
      if (job.scanningHistory) {
        await job.capturing?.catch(() => {});
      }
      await job.reading?.catch(() => {});
      job.session = null;
      await session?.close().catch(() => {});
      await job.capturing?.catch(() => {});
    })().finally(() => {
      job.finishing = null;
    });
    return job.finishing;
  };

  const onDownload = async (job, artifact) => {
    if (!ACTIVE.has(job.state) || !artifact?.path) {
      return;
    }
    job.pendingDownloads += 1;
    touch(job, { state: 'importing' });
    try {
      await importInto(store, dataDir, job, artifact.path, touch);
    } finally {
      job.pendingDownloads -= 1;
      if (
        job.state === 'importing' &&
        !job.capturing &&
        !job.pendingDownloads
      ) {
        touch(job, { state: 'waiting' });
      }
    }
  };

  const launch = async (job) => {
    try {
      const session = await openSession(job, deps);
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
      if (job.state === 'launching') {
        touch(job, { state: 'failed', error: error.message });
      }
    }
  };

  const activeFor = (provider, slot) =>
    [...jobs.values()].find(
      (job) =>
        job.provider === provider &&
        job.slot === slot &&
        (ACTIVE.has(job.state) || job.finishing)
    );

  const requireJob = (id) => {
    const job = jobs.get(id);
    if (!job) {
      throw statusError(`unknown auto-import job "${id}"`, 404);
    }
    return job;
  };

  return {
    start(provider, { slot = 'main' } = {}) {
      browserName(slot);
      const recipe = autoImportRecipes[provider];
      if (!recipe) {
        throw statusError(`no auto-import recipe for "${provider}"`, 400);
      }
      const existing = activeFor(provider, slot);
      if (existing) {
        return snapshot(existing);
      }
      const job = newJob(provider, slot, recipe);
      jobs.set(job.id, job);
      touch(job, { state: 'launching' });
      job.ready = launch(job);
      return snapshot(job);
    },

    get: (id) => snapshot(requireJob(id)),

    list: () => [...jobs.values()].map(snapshot),

    /** Read the messages of the chat open in the browser right now. */
    async capture(id, options = {}) {
      return captureJob(store, requireJob(id), touch, options);
    },

    withOpenHhImport: (slot, work) =>
      readOpenHhImport(activeFor('hh', slot), work, touch),

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
