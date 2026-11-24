// A real Electron window and isolated Linux notification server rejecting Notify.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  nativeTheme,
  Notification,
} from 'electron';
import { createAttentionPrompt } from '../../js/electron/attention-prompt.js';
import { ATTENTION_REMIND_MS } from '../../js/src/automation/attention-policy.js';

const directory = mkdtempSync(join(tmpdir(), 'attention-prompt-electron-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);
app.on('window-all-closed', () => {});
const guard = setTimeout(() => app.exit(1), 12000);
const parent = process.env.META_SOVEREIGN_ATTENTION_PARENT_CONTROLLER;
const screenshot = process.env.META_SOVEREIGN_ATTENTION_SCREENSHOT;

const waitFor = async (ready) => {
  for (let attempt = 0; !ready() && attempt < 60; attempt++) {
    await wait(50);
  }
  assert.ok(ready(), 'native fixture did not reach the expected state');
};

const capture = async () => {
  if (screenshot) {
    const [screen] = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 720, height: 480 },
    });
    assert.ok(!screen.thumbnail.isEmpty());
    await writeFile(screenshot, screen.thumbnail.toPNG());
  }
};

const openBrowserFixture = async (browser, waits) => {
  const browserPage = `<meta charset="utf-8"><title>Browser verification fixture</title>
    <body style="margin:36px;background:#f1f4f8;font:16px system-ui;color:#35465d">
    <h1>Browser verification fixture</h1><p>Waiting for owner sign-in.</p>`;
  for (const { browserSlot } of waits) {
    const window = new BrowserWindow({
      show: false,
      x: 0,
      y: 0,
      width: 720,
      height: 480,
    });
    browser.set(browserSlot, window);
    await window.loadURL(`data:text/html,${encodeURIComponent(browserPage)}`);
  }
};

const choose = async (window, action) => {
  await window.webContents
    .executeJavaScript(
      `document.getElementById(${JSON.stringify(action)}).click()`
    )
    .catch(() => {});
  await waitFor(() => window.isDestroyed());
};

const run = async () => {
  const { DesktopOwnerAttention } = await import(
    parent ? pathToFileURL(parent).href : '../../js/electron/owner-attention.js'
  );

  const promptWindows = [];
  const focused = [];
  let failed = 0;
  let chimes = 0;
  let now = Date.now();
  let active = [];
  class SystemNotification extends Notification {
    constructor(options) {
      super(options);
      this.on('failed', () => failed++);
    }
  }
  class PromptWindow extends BrowserWindow {
    constructor(options) {
      super(options);
      promptWindows.push(this);
    }
  }
  const ownerWait = (kind, browserSlot) => ({
    kind,
    id: 'fixture-private-id',
    requestId: 'fixture-private-request',
    browserSlot,
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    focusAvailable: true,
  });
  const browser = new Map();
  const controller = new DesktopOwnerAttention({
    Notification: SystemNotification,
    prompt: createAttentionPrompt({ BrowserWindow: PromptWindow, nativeTheme }),
    beep: () => chimes++,
    now: () => now,
    owner: {
      read: async () => active,
      focus: async (item) => {
        assert.ok(active.includes(item));
        const window = browser.get(item.browserSlot);
        window.show();
        window.focus();
        focused.push(item.kind);
        return { ok: true };
      },
    },
    setInterval: () => ({}),
    clearInterval: () => {},
  });

  try {
    await app.whenReady();
    nativeTheme.themeSource = 'light';
    assert.equal(Notification.isSupported(), true);
    const login = ownerWait('hh-manual-login', 'fixture-private-login');
    const application = ownerWait(
      'hh-application-verification',
      'fixture-private-application'
    );
    await openBrowserFixture(browser, [login, application]);
    browser.get(login.browserSlot).show();
    active = [login];
    assert.deepEqual(
      controller.configure({ enabled: true, sound: true, locale: 'en' }),
      {
        visual: true,
        audio: true,
      }
    );
    await waitFor(() => failed === 1);
    if (parent) {
      await wait(250);
      await capture();
      assert.equal(
        promptWindows.length,
        1,
        'failed system notice must open a desktop prompt'
      );
    }
    await waitFor(() => promptWindows[0]?.isVisible());
    const first = promptWindows[0];
    assert.equal(first.isAlwaysOnTop(), true);
    assert.equal(first.isFocused(), false);
    const message = await first.webContents.executeJavaScript(
      'document.body.innerText'
    );
    assert.match(message, /Show browser\s+Later/u);
    assert.doesNotMatch(message, /fixture-private/u);
    assert.equal(
      await first.webContents.executeJavaScript('typeof require'),
      'undefined'
    );
    await capture();
    await choose(first, 'show');
    assert.deepEqual(focused, ['hh-manual-login']);
    assert.equal(browser.get(application.browserSlot).isVisible(), false);
    active = [login, application];
    await controller.refresh();
    await waitFor(() => failed === 2 && promptWindows[1]?.isVisible());
    await choose(promptWindows[1], 'later');
    now += ATTENTION_REMIND_MS;
    await controller.refresh();
    assert.equal(chimes, 2);
    assert.equal(promptWindows.length, 2);
    assert.deepEqual(focused, ['hh-manual-login']);
    console.log(
      JSON.stringify({
        electron: process.versions.electron,
        failedNativeNotices: failed,
        prompts: promptWindows.length,
        exactFocus: focused,
        chimes,
        laterAccepted: true,
        liveProvider: false,
      })
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    controller.close();
    for (const window of [...promptWindows, ...browser.values()]) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
    await rm(directory, { recursive: true, force: true });
    clearTimeout(guard);
    app.exit(process.exitCode ?? 0);
  }
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
