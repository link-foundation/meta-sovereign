// Real browser e2e for "the page behaves the same everywhere and never hides
// errors" (R-Z12): every dialog reachable with fake data has aria-modal and a
// name, takes focus when it opens, keeps Tab inside, closes on Escape and
// gives focus back to what opened it; and a server refusal in the uniform
// { ok: false, error, code } shape shows as a localised toast instead of
// vanishing. Telegram's answers faked in the page, a fake chat in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:consistency
//   E2E_BROWSER=webkit RUN_BROWSER_E2E=1 npm run test:e2e:consistency

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const GROUP = '-1005';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${GROUP}:1`,
  source: 'telegram',
  chat: GROUP,
  chatName: 'Editable Group',
  chatType: 'supergroup',
  sender: '31',
  senderName: 'Some Member',
  body: 'hi all',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('consistency', {
  store,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: GROUP,
    kind: 'group',
    title: 'Editable Group',
    members: 12,
    about: 'Old about',
    canEdit: true,
  })
);
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [{ id: '4', name: 'Alice Ant', username: 'alice' }],
  })
);
await page.route('**/api/telegram/channel-create', (route) =>
  fulfil(route, { ok: false, error: 'no space', code: 'STORE_FULL' }, 507)
);

const inside = (selector) =>
  page.evaluate(
    (sel) => document.querySelector(sel)?.contains(document.activeElement),
    selector
  );
const label = (selector) =>
  page.evaluate((sel) => {
    const node = document.querySelector(sel);
    return (
      node?.getAttribute('aria-modal') === 'true' &&
      Boolean(
        node.getAttribute('aria-label') ||
        node.getAttribute('aria-labelledby') ||
        node.querySelector('h2,h3')
      )
    );
  }, selector);
const activeIs = (selector) =>
  page.evaluate((sel) => document.activeElement?.matches(sel), selector);

// Opens a dialog, checks modal semantics, focus-in, the Tab trap, then
// Escape and focus back on `opener`.
const checkDialog = async ({ name, open, opener }) => {
  const dialog = `[data-dialog="${name}"]`;
  await open();
  await page.locator(dialog).waitFor({ timeout: 5000 });
  assert(await label(dialog), `${name}: aria-modal and a name`);
  await until(() => inside(dialog), `${name}: focus moves into the dialog`);
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    assert(await inside(dialog), `${name}: Tab ${i} stayed inside`);
  }
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Shift+Tab');
    assert(await inside(dialog), `${name}: Shift+Tab ${i} stayed inside`);
  }
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator(dialog).count()) === 0,
    `${name}: Escape closes`
  );
  await until(() => activeIs(opener), `${name}: focus returns to ${opener}`);
};

const dialogSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${GROUP}"]`).waitFor();
  const menu = (action) => async () => {
    await page.locator('[data-action="new-chat"]').click();
    await page.locator(`[data-action="${action}"]`).click();
  };
  await checkDialog({
    name: 'new-group',
    open: menu('new-group'),
    opener: '[data-action="new-chat"]',
  });
  await checkDialog({
    name: 'new-channel',
    open: menu('new-channel'),
    opener: '[data-action="new-chat"]',
  });
  await page.evaluate(() => {
    globalThis.location.hash = 'chat=telegram:-1005';
  });
  await page.locator('[data-action="chat-about"]').click();
  await checkDialog({
    name: 'edit-chat',
    open: () => page.locator('.person-panel [data-action="edit-chat"]').click(),
    opener: '.person-panel [data-action="edit-chat"]',
  });
};

const toastSteps = async () => {
  await page.locator('[data-action="new-chat"]').click();
  await page.locator('[data-action="new-channel"]').click();
  const dialog = page.locator('[data-dialog="new-channel"]');
  await dialog.locator('[data-field="title"]').fill('News');
  await dialog.locator('[data-action="submit"]').click();
  const toast = page.locator('[data-banner="api-error"]');
  await toast.waitFor({ timeout: 5000 });
  assert(
    (await toast.getAttribute('data-error-code')) === 'STORE_FULL',
    'the toast carries the server code'
  );
  assert(
    (await toast.textContent()).includes('The disk is full'),
    `the toast is words: ${await toast.textContent()}`
  );
  await toast.locator('[data-action="api-error-dismiss"]').click();
  assert((await toast.count()) === 0, 'the toast can be dismissed');
};

await finish(async () => {
  await dialogSteps();
  await page.keyboard.press('Escape');
  await toastSteps();
});
