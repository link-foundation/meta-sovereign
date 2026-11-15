// One finite native Electron case. Every HTTPS request is intercepted locally;
// no VK login, provider request, application server or user profile is used.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
import { verifyNativeDesktopClipboard } from './desktop-clipboard-electron.mjs';
import { verifyNativeDesktopTls } from './desktop-config-electron.mjs';
import { openVkAuthorization } from '../../js/electron/vk-authorization.js';
import { VK_DESKTOP_AUTHORIZE_URL } from '../../js/src/sources/vk-token-input.js';

const directory = mkdtempSync(join(tmpdir(), 'vk-token-electron-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);
app.on('window-all-closed', () => {});
const controller = new AbortController();
let forcedExit;
const deadline = globalThis.setTimeout(() => {
  console.error('Native VK authorization check deadline reached.');
  controller.abort();
  // Also bound a readiness or storage-cleanup stall, where abort has no reader.
  forcedExit = globalThis.setTimeout(() => app.exit(1), 2000);
}, 15000);
const token = 'electron_fixture_user_token_123456789';
const redirect = `https://oauth.vk.com/blank.html#access_token=${token}&user_id=42`;
let parent;
let child;
let session;
const requests = [];
const run = async () => {
  try {
    console.log('Native VK authorization check awaiting Electron readiness.');
    await app.whenReady();
    parent = new BrowserWindow({ show: false });
    class FixtureAuthorizationWindow extends BrowserWindow {
      constructor(options) {
        super(options);
        child = this;
        session = this.webContents.session;
        session.protocol.handle('https', (request) => {
          requests.push(request.url);
          assert.equal(request.url, VK_DESKTOP_AUTHORIZE_URL);
          return new globalThis.Response(
            `<script>document.cookie='fixture=private; Secure';location.assign(${JSON.stringify(redirect)})</script>`,
            { headers: { 'content-type': 'text/html' } }
          );
        });
      }
    }
    const done = openVkAuthorization({
      BrowserWindow: FixtureAuthorizationWindow,
      parent,
      signal: controller.signal,
    });
    const preferences = child.webContents.getLastWebPreferences();
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.sandbox, true);
    assert.ok(!preferences.preload);
    assert.equal(session.isPersistent(), false);
    assert.deepEqual(await done, { token, userId: '42' });
    assert.equal(child.isDestroyed(), true);
    assert.deepEqual(await session.cookies.get({}), []);
    assert.deepEqual(requests, [VK_DESKTOP_AUTHORIZE_URL]);
    const copied = await verifyNativeDesktopClipboard({
      BrowserWindow,
      ipcMain,
      clipboard,
    });
    const tls = await verifyNativeDesktopTls({ app, BrowserWindow });
    console.log(
      JSON.stringify({
        nativeElectron: true,
        mainFrameCapture: true,
        protectedPreferences: true,
        ephemeralSessionCleared: true,
        liveProvider: false,
        ...copied,
        ...tls,
      })
    );
  } catch (error) {
    console.error(
      'Native VK authorization check failed:',
      error.code ?? error.name
    );
    process.exitCode = 1;
  } finally {
    controller.abort();
    if (child && !child.isDestroyed()) {
      child.destroy();
    }
    if (parent && !parent.isDestroyed()) {
      parent.destroy();
    }
    session?.protocol.unhandle('https');
    await rm(directory, { recursive: true, force: true });
    globalThis.clearTimeout(deadline);
    globalThis.clearTimeout(forcedExit);
    app.exit(process.exitCode ?? 0);
  }
};

// Electron releases ready after ESM entry evaluation. Keep that evaluation
// independent of the asynchronous check, as in the production desktop entry.
void run().catch(() => app.exit(1));
