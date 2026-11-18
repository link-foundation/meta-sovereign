import { randomUUID } from 'node:crypto';
import {
  VK_DESKTOP_AUTHORIZE_URL,
  isVkTokenRedirect,
  parseVkTokenInput,
  vkTokenFailure,
} from '../src/sources/vk-token-input.js';

const AUTH_HOSTS = new Set([
  'oauth.vk.com',
  'oauth.vk.ru',
  'login.vk.com',
  'login.vk.ru',
  'id.vk.com',
  'id.vk.ru',
]);

export const permittedVkAuthorizationNavigation = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      AUTH_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
};

/** Remote VK content receives no preload, Node, persistent session or popup. */
export const openVkAuthorization = ({ BrowserWindow, parent, signal }) => {
  signal.throwIfAborted();
  if (!parent || parent.isDestroyed()) {
    throw vkTokenFailure('authorization-unavailable');
  }
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      parent,
      width: 720,
      height: 780,
      show: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        partition: `vk-authorization:${randomUUID()}`,
      },
    });
    const contents = win.webContents;
    const session = contents.session;
    let settled = false;
    const finish = async (error, captured) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', aborted);
      parent.removeListener('closed', aborted);
      if (!win.isDestroyed()) {
        win.destroy();
      }
      try {
        await session.clearStorageData();
      } catch {
        error = vkTokenFailure('authorization-cleanup-failed');
      }
      if (error) {
        reject(error);
      } else {
        resolve(captured);
      }
    };
    const aborted = () =>
      void finish(vkTokenFailure('authorization-cancelled'));
    const navigate = (event, value, mainFrame = true) => {
      if (!mainFrame) {
        if (!permittedVkAuthorizationNavigation(value)) {
          event.preventDefault();
        }
        return;
      }
      if (isVkTokenRedirect(value)) {
        event.preventDefault();
        try {
          // Only the token and optional account ID leave the authorization window.
          void finish(null, parseVkTokenInput(value));
        } catch (error) {
          void finish(error);
        }
      } else if (!permittedVkAuthorizationNavigation(value)) {
        event.preventDefault();
        void finish(vkTokenFailure('authorization-navigation-refused'));
      }
    };
    contents.session.setPermissionRequestHandler((_web, _permission, done) =>
      done(false)
    );
    contents.session.setPermissionCheckHandler(() => false);
    contents.session.on('will-download', (event) => event.preventDefault());
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('will-navigate', navigate);
    contents.on('will-frame-navigate', (event) =>
      navigate(event, event.url, event.isMainFrame)
    );
    contents.on('will-redirect', (event, url, _inPlace, mainFrame) =>
      navigate(event, event.url ?? url, event.isMainFrame ?? mainFrame)
    );
    contents.on('did-navigate-in-page', navigate);
    contents.on('did-navigate', (event, url) => navigate(event, url));
    contents.setWindowOpenHandler(({ url }) => {
      // Capture an exact final redirect even when VK tries to open a popup.
      if (isVkTokenRedirect(url)) {
        navigate({ preventDefault() {} }, url);
      }
      return { action: 'deny' };
    });
    win.once('closed', aborted);
    parent.once('closed', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) {
      aborted();
    } else {
      void win.loadURL(VK_DESKTOP_AUTHORIZE_URL).catch(() => {
        void finish(vkTokenFailure('authorization-unavailable'));
      });
    }
  });
};
