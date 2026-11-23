// Private Linux Electron session. The renderer configures the production
// bridge, then the isolated notification daemon delivers native actions.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import { DesktopOwnerAttention } from '../../js/electron/owner-attention.js';
import { createMainWindow } from '../../js/electron/window.js';

const directory = mkdtempSync(join(tmpdir(), 'owner-attention-electron-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);
app.on('window-all-closed', () => {});
const parentPreload = process.env.META_SOVEREIGN_ATTENTION_PARENT_PRELOAD;
const deadline = setTimeout(() => app.exit(1), 12000);
const page = createServer((_request, response) => {
  response.end('<!doctype html><title>Private owner attention fixture</title>');
});
let renderer;
let now = Date.now();
let notices = [];
const focused = [];
const posted = [];
const browser = new Map();
class FixtureWindow extends BrowserWindow {
  constructor(options) {
    super(
      parentPreload
        ? {
            ...options,
            webPreferences: {
              ...options.webPreferences,
              preload: parentPreload,
            },
          }
        : options
    );
  }
}
const controller = new DesktopOwnerAttention({
  Notification,
  now: () => now,
  owner: {
    read: async () => notices,
    focus: async (item) => {
      assert.equal(renderer.isDestroyed(), true);
      assert.ok(notices.includes(item));
      await browser
        .get(item.browserSlot)
        .webContents.executeJavaScript('document.title');
      const window = browser.get(item.browserSlot);
      window.show();
      window.focus();
      assert.equal(window.isVisible(), true);
      focused.push(item.kind);
      return { ok: true };
    },
  },
  setInterval: () => ({}),
  clearInterval: () => {},
});
const post = controller.post.bind(controller);
controller.post = (entry) => {
  posted.push(entry.item.kind);
  post(entry);
};

const privateWait = (kind, slot) => ({
  kind,
  id: 'fixture-private-id',
  requestId: 'fixture-private-request',
  browserSlot: slot,
  expiresAt: new Date(now + 30 * 60_000).toISOString(),
  focusAvailable: true,
});

const run = async () => {
  try {
    await app.whenReady();
    await new Promise((resolve, reject) => {
      page.once('error', reject);
      page.listen(0, '127.0.0.1', resolve);
    });
    const { port } = page.address();
    renderer = await createMainWindow({
      app,
      BrowserWindow: FixtureWindow,
      ipcMain,
      port,
      attention: controller,
    });
    const configure = 'globalThis.metaSovereignShell.ownerAttention.configure';
    assert.equal(
      await renderer.webContents.executeJavaScript(
        `typeof ${configure.replace(/\.configure$/u, '')}`
      ),
      'object',
      'owned preload exposes attention'
    );
    assert.deepEqual(
      await renderer.webContents.executeJavaScript(
        `${configure}({ enabled: true, sound: false, locale: 'en' })`
      ),
      { visual: true, audio: false }
    );
    renderer.destroy();
    const slot = 'fixture-private-browser';
    browser.set(slot, new BrowserWindow({ show: false }));
    await browser.get(slot).loadURL(`http://127.0.0.1:${port}/owner`);
    notices = [
      privateWait('captcha', slot),
      privateWait('hh-manual-login', slot),
    ];
    await controller.refresh();
    for (let count = 0; !focused.length && count < 50; count++) {
      await wait(50);
    }
    assert.deepEqual(focused, ['captcha']);
    await wait(150);
    now += 5 * 60_000;
    await controller.refresh();
    assert.deepEqual(posted, ['captcha', 'hh-manual-login']);
    console.log(
      JSON.stringify({
        nativeElectron: process.versions.electron,
        rendererDestroyed: true,
        focused,
        posted,
        actionAcknowledgement: true,
        liveProvider: false,
      })
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    controller.close();
    if (renderer && !renderer.isDestroyed()) {
      renderer.destroy();
    }
    for (const window of browser.values()) {
      window.destroy();
    }
    page.closeAllConnections();
    if (page.listening) {
      await new Promise((resolve) => page.close(resolve));
    }
    await rm(directory, { recursive: true, force: true });
    clearTimeout(deadline);
    app.exit(process.exitCode ?? 0);
  }
};

void run().catch(() => app.exit(1));
