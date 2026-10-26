/**
 * Electron desktop shell entry point (R-F3).
 *
 * Opens a single `BrowserWindow` pointing at the local web server
 * started in-process, so the same React app served over HTTP also
 * runs in Electron without a duplicate render path. When
 * `electron-updater` is installed by the consuming package, the shell
 * checks for signed desktop updates after Electron is ready.
 *
 * Packaged builds (issue #37) start from `app.asar`, where the process
 * cwd is `/` on macOS and read-only elsewhere, so the links store lives
 * in the per-user `userData` directory instead of `./.meta-sovereign`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// electron-updater is CommonJS and defines `autoUpdater` with a lazy
// getter, which Node's ESM named-export detection cannot see: the named
// import is undefined and the updater is only reachable through the
// default (module.exports) object (issue #37).
export const pickAutoUpdater = (mod) =>
  mod?.autoUpdater ?? mod?.default?.autoUpdater ?? null;

const loadAutoUpdater = async () => {
  const mod = await import('electron-updater').catch(() => ({}));
  return pickAutoUpdater(mod);
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

// electron-builder writes one `latest.yml` for every Windows
// architecture, and the x64 build owns it, so an arm64 install would
// "update" itself to the x64 installer. Those installs update by
// downloading a new release until a separate arm64 channel exists.
const unsupportedUpdateArch = (platform, arch, feedUrl) =>
  platform === 'win32' && arch === 'arm64' && !feedUrl;

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
  platform = process.platform,
  arch = process.arch,
} = {}) => {
  if (unsupportedUpdateArch(platform, arch, feedUrl)) {
    logger.info?.('[electron] auto-updates are not published for win32-arm64');
    return { enabled: false, reason: 'unsupported-arch' };
  }
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

// The page's own background (`--bg` in app.css) for the OS theme, so a
// dark desktop does not flash white before the app paints. The window
// shows once the first frame is ready (Electron's "showing the window
// gracefully"); it narrows to a phone's width, where the app switches to
// its bottom bar, and no further.
const WINDOW_BACKGROUND = { light: '#ffffff', dark: '#0e1116' };
export const MIN_WINDOW = { width: 360, height: 480 };

export const createMainWindow = async ({
  BrowserWindow,
  port,
  nativeTheme,
}) => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    show: false,
    backgroundColor: nativeTheme?.shouldUseDarkColors
      ? WINDOW_BACKGROUND.dark
      : WINDOW_BACKGROUND.light,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
    },
  });
  win.once('ready-to-show', () => win.show());
  await win.loadURL(`http://127.0.0.1:${port}/`);
  return win;
};

/**
 * Where the desktop shell keeps its links store:
 * `META_SOVEREIGN_STORE_DIR` when set, otherwise `<userData>/store`
 * (e.g. `~/.config/Meta Sovereign/store` on Linux).
 */
export const resolveDesktopStoreDir = ({ app, env = process.env } = {}) =>
  env.META_SOVEREIGN_STORE_DIR || path.join(app.getPath('userData'), 'store');

export const startDesktop = async () => {
  const [{ app, BrowserWindow, nativeTheme }, { startServer }, autoUpdater] =
    await Promise.all([
      loadElectron(),
      import('../src/server/index.js'),
      loadAutoUpdater(),
    ]);
  const handle = await startServer({
    port: 0,
    localUi: true,
    storeDir: resolveDesktopStoreDir({ app }),
  });

  await app.whenReady();
  configureAutoUpdates({ app, autoUpdater });
  await createMainWindow({ BrowserWindow, nativeTheme, port: handle.port });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow({ BrowserWindow, nativeTheme, port: handle.port });
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      handle.close().then(() => app.quit());
    }
  });
};

// Packaged apps load this file as `package.json#main` with no script
// path in argv, so start whenever we run in Electron's main process;
// plain Node (tests, `import`) only gets the exported helpers.
if (process.versions.electron && process.type === 'browser') {
  startDesktop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
