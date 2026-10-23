// Real browser e2e for the local passcode (R-Y183): turn it on in Settings →
// Privacy and Security (typed twice), Lock now shows the full-screen unlock
// screen and the server answers 423 to its routes, a wrong passcode is
// refused (and the next one made to wait), the right one unlocks, Ctrl+L
// locks, the auto-lock fires after the idle period, change and turn off ask
// the current passcode. Fake chats in a memory store and a temporary store
// directory; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:passcode

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
await store.put({
  id: 'msg:telegram:111:1',
  source: 'telegram',
  chat: '111',
  chatName: 'Fake Alice',
  chatType: 'user',
  sender: '111',
  senderName: 'Fake Alice',
  body: 'hello from Fake Alice',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const app = await openChatApp('passcode', { store });
const { page, base, until } = app;
const field = (name) => page.locator(`[data-field="${name}"]`);
const action = (name) => page.locator(`[data-action="${name}"]`);
const apiStatus = () =>
  page.evaluate(async () => (await fetch('/api/status')).status);
const locked = () => page.locator('[data-screen="locked"]').count();

// The settings dialog needs Telegram's side faked (nothing reaches it).
const FAKES = {
  profile: {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  },
  privacy: { ok: true, keys: [] },
  'privacy-ttl': { ok: true, period: 0 },
  'archive-settings': {
    ok: true,
    settings: {
      archiveAndMute: false,
      keepUnmuted: false,
      keepFolders: false,
      hideReadMarks: false,
      requirePremium: false,
    },
  },
  'web-sessions': { ok: true, sessions: [] },
  blocked: { ok: true, count: 0, items: [], next: null },
  sessions: { ok: true, ttlDays: 180, sessions: [] },
  security: {
    ok: true,
    password: {
      has: false,
      hint: '',
      hasRecovery: false,
      emailPending: false,
      emailPattern: '',
      resetPending: false,
    },
    accountTtlDays: 180,
    content: { enabled: false, canChange: false },
  },
};
for (const [name, body] of Object.entries(FAKES)) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, body));
}

const openPrivacy = async () => {
  if ((await page.locator('[data-dialog="privacy"]').count()) > 0) {
    return;
  }
  await page.locator('[data-action="my-profile"]').first().click();
  await until(
    async () =>
      (await page.locator('[data-action="open-privacy"]').count()) > 0,
    'the privacy entry'
  );
  await page.locator('[data-action="open-privacy"]').first().click();
  await until(
    async () => (await page.locator('[data-dialog="privacy"]').count()) > 0,
    'the privacy dialog'
  );
};

await app.finish(async () => {
  await page.goto(`${base}/`);
  await until(
    async () => (await page.locator('.chat-item').count()) > 0,
    'the chat list'
  );
  assert((await apiStatus()) === 200, 'open without a passcode');
  assert((await locked()) === 0, 'no lock screen by default');

  // Turn it on through the settings dialog.
  await openPrivacy();
  await action('passcode-on').click();
  await field('passcode-passcode').fill('open sesame');
  await field('passcode-repeat').fill('open sesamf');
  await action('passcode-save').click();
  await until(
    async () => (await page.locator('.chat-form-error').count()) > 0,
    'the mismatch message'
  );
  await field('passcode-repeat').fill('open sesame');
  await action('passcode-save').click();
  await until(
    async () => (await action('passcode-off').count()) > 0,
    'the passcode turned on'
  );
  assert((await apiStatus()) === 200, 'still open right after turning on');

  // Lock now.
  await action('lock-now').click();
  await until(async () => (await locked()) === 1, 'the lock screen');
  assert((await apiStatus()) === 423, 'the server refuses while locked');
  assert(
    (await page.locator('.chat-item').count()) === 0,
    'the app is not shown while locked'
  );

  // A wrong passcode is refused; the right one unlocks.
  await field('unlock-passcode').fill('nope');
  await action('unlock').click();
  await until(
    async () => (await page.locator('.lock-card .chat-form-error').count()) > 0,
    'the wrong passcode message'
  );
  assert((await locked()) === 1, 'still locked after a wrong passcode');
  await page.waitForTimeout(1200);
  await field('unlock-passcode').fill('open sesame');
  await action('unlock').click();
  await until(
    async () => (await page.locator('.chat-item').count()) > 0,
    'the app back after unlocking'
  );
  assert((await apiStatus()) === 200, 'open again after unlocking');

  // Ctrl+L locks.
  await page.keyboard.press('Control+l');
  await until(async () => (await locked()) === 1, 'Ctrl+L locks');
  await field('unlock-passcode').fill('open sesame');
  await action('unlock').click();
  await until(
    async () => (await page.locator('.chat-item').count()) > 0,
    'unlocked again'
  );

  // The auto-lock fires after the idle period (a fake clock).
  await openPrivacy();
  await field('passcode-auto-lock').selectOption('1');
  await until(
    async () =>
      (await page.evaluate(
        async () =>
          (await (await fetch('/api/passcode/status')).json()).autoLockMinutes
      )) === 1,
    'the auto-lock saved'
  );
  await page.clock.install();
  await page.reload();
  await until(
    async () => (await page.locator('.chat-item').count()) > 0,
    'reloaded'
  );
  await page.clock.fastForward(90_000);
  await until(async () => (await locked()) === 1, 'the auto-lock');
  await page.clock.resume();
  await field('unlock-passcode').fill('open sesame');
  await action('unlock').click();
  await until(
    async () => (await page.locator('.chat-item').count()) > 0,
    'unlocked after the auto-lock'
  );

  // Change, then turn off: both ask for the current one.
  await openPrivacy();
  await action('passcode-change').click();
  await field('passcode-current').fill('wrong one');
  await field('passcode-passcode').fill('second');
  await field('passcode-repeat').fill('second');
  await action('passcode-save').click();
  await until(
    async () => (await page.locator('.chat-form-error').count()) > 0,
    'the wrong current passcode'
  );
  await page.waitForTimeout(1200);
  await field('passcode-current').fill('open sesame');
  await action('passcode-save').click();
  await until(
    async () => (await action('passcode-change').count()) > 0,
    'the passcode changed'
  );
  await action('passcode-off').click();
  await field('passcode-current').fill('second');
  await action('passcode-save').click();
  await until(
    async () => (await action('passcode-on').count()) > 0,
    'the passcode turned off'
  );
  assert((await apiStatus()) === 200, 'open after turning off');
});
