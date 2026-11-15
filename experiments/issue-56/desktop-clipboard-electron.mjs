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
  let phase = 'read-previous';
  let previous;
  const text = 'redacted visible native fixture\nsecond line';
  const server = createServer((_request, response) =>
    response.end('<!doctype html><title>Private clipboard fixture</title>')
  );
  let window;
  let dispose;
  try {
    previous = await clipboard.readText();
    phase = 'listen';
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    phase = 'create-window';
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
    window.webContents.on('preload-error', (_event, _path, error) => {
      console.error('Native clipboard preload refused:', error?.name);
    });
    phase = 'attach';
    dispose = attachClipboard({
      ipcMain,
      clipboard,
      contents: window.webContents,
      origin,
    });
    phase = 'load-owned';
    await window.loadURL(origin);
    phase = 'owned-preload';
    assert.equal(
      await window.webContents.executeJavaScript(
        'typeof globalThis.metaSovereignShell?.copyText'
      ),
      'function'
    );
    phase = 'owned-write';
    const receipt = await window.webContents.executeJavaScript(
      `globalThis.metaSovereignShell.copyText(${JSON.stringify(text)})`
    );
    assert.deepEqual(receipt, { ok: true });
    phase = 'owned-readback';
    assert.equal(await clipboard.readText(), text);
    phase = 'load-foreign';
    await window.loadURL('data:text/html,foreign%20fixture');
    phase = 'foreign-preload';
    assert.equal(
      await window.webContents.executeJavaScript(
        'typeof globalThis.metaSovereignShell?.copyText'
      ),
      'function'
    );
    phase = 'foreign-write';
    const refused = await window.webContents.executeJavaScript(
      "globalThis.metaSovereignShell.copyText('refused')"
    );
    assert.deepEqual(refused, { ok: false });
    assert.equal(await clipboard.readText(), text);
    return {
      nativeClipboard: true,
      ownedOriginRequired: true,
      foreignNavigationRefused: true,
    };
  } catch (error) {
    throw Object.assign(new Error('Native clipboard fixture failed.'), {
      code: `NATIVE_CLIPBOARD_${phase}_${error?.name}`,
    });
  } finally {
    dispose?.();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previous !== undefined) {
      await clipboard.writeText(previous);
    }
  }
};
