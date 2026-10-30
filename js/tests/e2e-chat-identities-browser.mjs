import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
await store.putMany(
  ['555', '777'].map((chat) => ({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    sender: 'me',
    body: 'Fixture message',
    chatType: 'personal_chat',
    timestamp: new Date().toISOString(),
    ...(chat === '555' ? { deletedAccount: true } : {}),
  }))
);
const { page, base, until, finish } = await openChatApp('chat-identities', {
  store,
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignTheme', 'dark');
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem('metaSovereignReadReceipts', 'off');
  globalThis.__copiedIds = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        globalThis.__copiedIds.push(text);
      },
    },
  });
});
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    kind: 'user',
    title: null,
    members: 1,
    online: false,
    photo: false,
  })
);

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:555`);
  await until(
    async () =>
      (await page.locator('.chat-header strong').textContent()) ===
      'Deleted account',
    'cached deletion flag names the header'
  );
  const deleted = page.locator('[data-chat="telegram:555"]');
  assert(
    (await deleted.locator('.chat-item-title').textContent()) ===
      'Deleted account',
    'list does not show the ID as a name'
  );
  assert(
    (await deleted.locator('.account-deleted-badge').count()) === 1,
    'deleted list identity has an accessible badge'
  );
  assert(
    (await page.locator('.chat-header .deleted-account-avatar').count()) === 1,
    'header has a deleted-account avatar'
  );
  assert(
    !(await page.locator('.chat-header-title').textContent()).includes(
      'last seen'
    ),
    'deleted identity does not pretend to have a last-seen state'
  );
  await page.locator('.chat-header [data-action="chat-about"]').click();
  await page.locator('.profile-user-id').waitFor();
  assert(
    (await page.locator('.profile-name').textContent()) === 'Deleted account',
    'profile uses the same identity'
  );
  assert(
    (await page.locator('.profile-user-id dt').textContent()) ===
      'Telegram user ID',
    'identifier is explicitly labeled'
  );
  assert(
    (await page.locator('.profile-user-id code').textContent()) === '555',
    'raw identifier is available in profile'
  );
  await until(
    () =>
      page
        .locator('.chat-composer textarea')
        .evaluate((node) => node.clientHeight < 60 && node.clientWidth > 160),
    'empty composer stays compact and readable beside the profile'
  );
  await page
    .getByRole('button', { name: 'Copy Telegram user ID', exact: true })
    .click();
  assert(
    (await page.evaluate(() => globalThis.__copiedIds.at(-1))) === '555',
    'copy preserves the exact identifier'
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.locator('.profile-user-id code').isVisible(),
    'identifier remains usable on phone widths'
  );
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`${base}/#chat=telegram:777`);
  await until(
    async () =>
      (await page.locator('.chat-header strong').textContent()) ===
      'Telegram user',
    'a live nameless user has a neutral label'
  );
  assert(
    (await page.locator('.chat-header .account-deleted-badge').count()) === 0,
    'a missing name alone never means deleted'
  );
});
