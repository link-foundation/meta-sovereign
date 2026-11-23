import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachClipboard } from './clipboard.js';
import { attachLocalCertificate } from './local-certificate.js';
import { attachOwnerAttention } from './owner-attention-ipc.js';

const preload = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'preload.cjs'
);

// The page's own background (`--bg` in app.css) for the OS theme, so a
// dark desktop does not flash white before the app paints. The window
// shows once the first frame is ready (Electron's "showing the window
// gracefully"); it narrows to a phone's width, where the app switches to
// its bottom bar, and no further.
const WINDOW_BACKGROUND = { light: '#ffffff', dark: '#0e1116' };
export const MIN_WINDOW = { width: 360, height: 480 };

export const createMainWindow = async ({
  app,
  BrowserWindow,
  port,
  tls,
  nativeTheme,
  ipcMain,
  clipboard,
  attention,
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
  let releaseClipboard = () => {};
  let releaseCertificate = () => {};
  let releaseAttention = () => {};
  const origin = `${tls ? 'https' : 'http'}://127.0.0.1:${port}`;
  try {
    if (tls) {
      releaseCertificate = attachLocalCertificate({
        app,
        contents: win.webContents,
        origin,
        fingerprint: tls.fingerprint,
      });
      win.once('closed', releaseCertificate);
    }
    releaseClipboard = attachClipboard({
      ipcMain,
      clipboard,
      contents: win.webContents,
      origin,
    });
    if (ipcMain && clipboard) {
      win.once('closed', releaseClipboard);
    }
    if (ipcMain && attention) {
      releaseAttention = attachOwnerAttention({
        ipcMain,
        attention,
        contents: win.webContents,
        origin,
      });
      win.once('closed', releaseAttention);
    }
    await win.loadURL(`${origin}/`);
  } catch (error) {
    releaseClipboard();
    releaseCertificate();
    releaseAttention();
    win.destroy();
    throw error;
  }
  return win;
};
