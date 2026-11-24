// Headed Chromium, an owned page, another tab and a separate top-level window.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  attentionPageForeground,
  bindAttentionPage,
} from '../../js/src/automation/attention-foreground.js';
import { ATTENTION_REMIND_MS } from '../../js/src/automation/attention-policy.js';
import { reviewAttention } from '../../js/src/forms/review-attention.js';
import { serverOwnerAttention } from '../../js/src/server/owner-attention.js';

const foreground = (page) =>
  attentionPageForeground(bindAttentionPage({ focusAvailable: true }, page));
const parent = process.env.META_SOVEREIGN_ATTENTION_PARENT_CONTROLLER;
const { DesktopOwnerAttention } = await import(
  parent ? pathToFileURL(parent).href : '../../js/electron/owner-attention.js'
);

const verifyAlerts = async (page, otherPage) => {
  let now = Date.now();
  let chimes = 0;
  let notices = 0;
  class Notification extends EventEmitter {
    static isSupported() {
      return true;
    }
    show() {
      notices++;
    }
    close() {}
  }
  const record = {
    id: 'private-review',
    slot: 'private-slot',
    state: 'open',
    task: true,
    browser: { policy: { headless: false }, page },
    lastPrefill: {
      result: {
        requestId: 'private-request',
        state: 'waiting-owner',
        wait: {
          kind: 'captcha',
          startedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 30 * 60_000).toISOString(),
        },
      },
    },
  };
  const owner = serverOwnerAttention({
    passcode: { locked: () => false },
    forms: { reviewAttention: () => reviewAttention([record], now) },
  });
  const controller = new DesktopOwnerAttention({
    owner,
    Notification,
    beep: () => chimes++,
    now: () => now,
    setInterval: () => ({}),
    clearInterval: () => {},
  });
  try {
    await page.bringToFront();
    controller.configure({ enabled: true, sound: true, locale: 'en' });
    for (let attempt = 0; controller.reading && attempt < 75; attempt++) {
      await wait(20);
    }
    assert.equal(controller.reading, false);
    const focused = { chimes, notices };
    console.log(JSON.stringify({ focused }));
    assert.deepEqual(
      focused,
      { chimes: 0, notices: 0 },
      'the exact foreground page should have no new desktop alert'
    );
    await otherPage.bringToFront();
    now += ATTENTION_REMIND_MS - 1;
    await controller.refresh();
    assert.equal(notices, 0);
    now++;
    await controller.refresh();
    const background = { chimes, notices };
    assert.deepEqual(background, { chimes: 1, notices: 1 });
    console.log(JSON.stringify({ background }));
  } finally {
    controller.close();
  }
};

const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.META_SOVEREIGN_TEST_CHROMIUM,
  args: ['--disable-dev-shm-usage', '--renderer-process-limit=2'],
  timeout: 5000,
});
try {
  const main = await browser.newContext();
  const page = await main.newPage();
  await page.setContent('<title>Owned local page</title>');
  await page.bringToFront();
  const initial = await foreground(page);
  await page.evaluate(() => {
    document.hasFocus = () => true;
    Object.defineProperty(document, 'visibilityState', { value: 'visible' });
  });
  const sameWindow = await main.newPage();
  await sameWindow.bringToFront();
  const anotherTab = await foreground(page);
  const misleadingMainWorld = await page.evaluate(() => document.hasFocus());
  await page.bringToFront();
  const returned = await foreground(page);
  const separate = await browser.newContext();
  const separatePage = await separate.newPage();
  await separatePage.bringToFront();
  const anotherWindow = await foreground(page);
  const separateFocused = await foreground(separatePage);
  console.log(
    JSON.stringify({
      version: browser.version(),
      initial,
      anotherTab,
      misleadingMainWorld,
      returned,
      anotherWindow,
      separateFocused,
    })
  );
  assert.deepEqual(
    [
      initial,
      anotherTab,
      misleadingMainWorld,
      returned,
      anotherWindow,
      separateFocused,
    ],
    [true, false, true, true, false, true]
  );
  await verifyAlerts(page, separatePage);
} finally {
  await browser.close();
}
