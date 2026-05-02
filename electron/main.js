/**
 * Electron desktop shell entry point (R-F3).
 *
 * Opens a single `BrowserWindow` pointing at the local web server
 * started in-process, so the same React app served over HTTP also
 * runs in Electron without a duplicate render path. When
 * `electron-updater` is installed by the consuming package, the shell
 * checks for signed desktop updates after Electron is ready.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const preload = path.join(here, 'preload.cjs');

const loadElectron = async () => {
  const electron = await import('electron').catch(() => ({}));
  if (!electron.app || !electron.BrowserWindow) {
    throw new Error(
      'electron is not installed; install the optional electron peer dependency to enable the desktop shell.'
    );
  }
  return electron;
};

const loadAutoUpdater = async () => {
  const mod = await import('electron-updater').catch(() => ({}));
  return mod.autoUpdater ?? null;
};

const updateEvents = [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
];

const configureUpdaterLogging = (autoUpdater, logger) => {
  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  for (const event of updateEvents) {
    autoUpdater.on?.(event, (info) => {
      logger.info?.(`[electron] ${event}`, info ?? '');
    });
  }
  autoUpdater.on?.('error', (err) => {
    logger.error?.('[electron] update error', err);
  });
};

const setUpdaterFeed = (autoUpdater, feedUrl) => {
  if (feedUrl && typeof autoUpdater.setFeedURL === 'function') {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  }
};

const shouldCheckForUpdates = (app, feedUrl) =>
  app?.isPackaged ||
  Boolean(feedUrl) ||
  process.env.META_SOVEREIGN_UPDATE_CHECK_IN_DEV === '1';

const beginUpdateCheck = (autoUpdater, logger) => {
  const check = autoUpdater.checkForUpdatesAndNotify?.();
  check?.catch?.((err) =>
    logger.error?.('[electron] update check failed', err)
  );
};

export const configureAutoUpdates = ({
  app,
  autoUpdater,
  feedUrl = process.env.META_SOVEREIGN_UPDATE_URL,
  logger = console,
} = {}) => {
  if (!autoUpdater) {
    logger.info?.(
      '[electron] electron-updater not installed; updates disabled'
    );
    return { enabled: false, reason: 'missing-auto-updater' };
  }

  configureUpdaterLogging(autoUpdater, logger);
  setUpdaterFeed(autoUpdater, feedUrl);

  if (!shouldCheckForUpdates(app, feedUrl)) {
    logger.info?.('[electron] update checks skipped outside packaged app');
    return { enabled: false, reason: 'development' };
  }

  beginUpdateCheck(autoUpdater, logger);
  return { enabled: true, reason: 'checking' };
};

export const createMainWindow = async ({ BrowserWindow, port }) => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
    },
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  return win;
};

export const startDesktop = async () => {
  const [{ app, BrowserWindow }, { startServer }, autoUpdater] =
    await Promise.all([
      loadElectron(),
      import('../src/server/index.js'),
      loadAutoUpdater(),
    ]);
  const handle = await startServer({ port: 0 });

  await app.whenReady();
  configureAutoUpdates({ app, autoUpdater });
  await createMainWindow({ BrowserWindow, port: handle.port });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow({ BrowserWindow, port: handle.port });
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      handle.close().then(() => app.quit());
    }
  });
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startDesktop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
