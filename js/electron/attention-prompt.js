import { fileURLToPath } from 'node:url';

const PAGE = new URL('./attention-prompt.html', import.meta.url).href;
const PRELOAD = fileURLToPath(
  new URL('./attention-prompt.cjs', import.meta.url)
);
const CHANNEL = 'meta-sovereign:attention-prompt';

/** A small local prompt for a desktop alert the operating system could not show. */
export const createAttentionPrompt =
  ({ BrowserWindow, nativeTheme }) =>
  ({ title, locale, body, show, later, onChoice }) => {
    const window = new BrowserWindow({
      title,
      width: 416,
      height: 190,
      useContentSize: true,
      show: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: nativeTheme?.shouldUseDarkColors ? '#171e28' : '#ffffff',
      webPreferences: {
        preload: PRELOAD,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'meta-sovereign-attention-prompt',
      },
    });
    const { webContents: contents } = window;
    let active = true;
    let visible = false;
    const release = () => {
      active = false;
      if (!window.isDestroyed()) {
        if (!contents.isDestroyed()) {
          contents.ipc?.removeHandler(CHANNEL);
        }
        window.destroy();
      }
    };
    try {
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      contents.on('will-navigate', (event) => event.preventDefault());
      contents.once('render-process-gone', release);
      contents.once('preload-error', release);
      contents.ipc.handle(CHANNEL, (event, operation) => {
        if (
          !active ||
          event.sender !== contents ||
          event.senderFrame !== contents.mainFrame ||
          event.senderFrame?.url !== PAGE
        ) {
          return null;
        }
        if (operation === 'labels') {
          return { locale, body, show, later };
        }
        if (operation === 'ready' && !visible) {
          window.showInactive();
          if (!window.isVisible()) {
            window.show();
          }
          visible = window.isVisible();
        } else if (
          visible &&
          (operation === 'later' || (operation === 'show' && show))
        ) {
          onChoice(operation === 'show');
        }
        return null;
      });
      window.once('closed', () => {
        if (active && visible) {
          active = false;
          onChoice(false);
        }
      });
      void window.loadURL(PAGE).catch(release);
      return release;
    } catch (error) {
      release();
      throw error;
    }
  };
