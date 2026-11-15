// Hosted native fixture only. The clipboard contains synthetic text and is
// restored; the private loopback page never loads the user's application.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { attachClipboard } from '../../js/electron/clipboard.js';

export const verifyNativeDesktopClipboard = async ({
  BrowserWindow,
  ipcMain,
  clipboard,
}) => {
  const previous = clipboard.readText();
  const text = 'redacted visible native fixture\nsecond line';
  const server = createServer((_request, response) =>
    response.end('<!doctype html><title>Private clipboard fixture</title>')
  );
  let window;
  let dispose;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: fileURLToPath(
          new URL('../../js/electron/preload.cjs', import.meta.url)
        ),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    dispose = attachClipboard({
      ipcMain,
      clipboard,
      contents: window.webContents,
      origin,
    });
    await window.loadURL(origin);
    const receipt = await window.webContents.executeJavaScript(
      `globalThis.metaSovereignShell.copyText(${JSON.stringify(text)})`
    );
    assert.deepEqual(receipt, { ok: true });
    assert.equal(clipboard.readText(), text);
    await window.loadURL('data:text/html,foreign%20fixture');
    const refused = await window.webContents.executeJavaScript(
      "globalThis.metaSovereignShell.copyText('refused')"
    );
    assert.deepEqual(refused, { ok: false });
    assert.equal(clipboard.readText(), text);
    return {
      nativeClipboard: true,
      ownedOriginRequired: true,
      foreignNavigationRefused: true,
    };
  } finally {
    dispose?.();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    clipboard.writeText(previous);
  }
};
