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
import { attachDesktopLifecycle } from './lifecycle.js';
import { openVkAuthorization } from './vk-authorization.js';
import { desktopConfiguration } from './configuration.js';
import { DesktopOwnerAttention } from './owner-attention.js';

import { createMainWindow } from './window.js';
export { createMainWindow, MIN_WINDOW } from './window.js';

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

/**
 * Where the desktop shell keeps its links store:
 * `META_SOVEREIGN_STORE_DIR` when set, otherwise `<userData>/store`
 * (e.g. `~/.config/Meta Sovereign/store` on Linux).
 */
export const resolveDesktopStoreDir = ({ app, env = process.env } = {}) =>
  env.META_SOVEREIGN_STORE_DIR || path.join(app.getPath('userData'), 'store');

export const startDesktop = async ({
  electronLoader = loadElectron,
  serverLoader = () => import('../src/server/index.js'),
  updaterLoader = loadAutoUpdater,
  argv,
  configuration,
} = {}) => {
  const [
    {
      app,
      BrowserWindow,
      nativeTheme,
      ipcMain,
      clipboard,
      Notification,
      shell,
    },
    autoUpdater,
  ] = await Promise.all([electronLoader(), updaterLoader()]);
  const options = await desktopConfiguration(
    argv ?? process.argv.slice(app.isPackaged ? 1 : 2),
    configuration
  );
  const { startServer } = await serverLoader();
  let mainWindow;
  const handle = await startServer({
    storeDir: resolveDesktopStoreDir({ app }),
    ...options,
    vkToken: {
      openAuthorization: async ({ signal }) => {
        await app.whenReady();
        return openVkAuthorization({
          BrowserWindow,
          parent: mainWindow,
          signal,
        });
      },
    },
  });
  let closing, lifecycle;
  const attention = new DesktopOwnerAttention({
    Notification,
    beep: typeof shell?.beep === 'function' ? () => shell.beep() : undefined,
    owner: handle.ownerAttention,
    showWindow: () => lifecycle?.show(),
  });
  const close = () =>
    (closing ??= Promise.resolve().then(() => {
      attention.close();
      return handle.close();
    }));

  try {
    await app.whenReady();
    configureAutoUpdates({ app, autoUpdater });
    lifecycle = await attachDesktopLifecycle({
      app,
      BrowserWindow,
      handle: { close },
      createWindow: async () => {
        mainWindow = await createMainWindow({
          app,
          BrowserWindow,
          nativeTheme,
          ipcMain,
          clipboard,
          attention,
          port: handle.port,
          tls: handle.tls,
        });
        return mainWindow;
      },
    });
    return lifecycle;
  } catch (error) {
    await close();
    throw error;
  }
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
