// Focused edit-history UI, including edits received with every browser closed.
import { createMemoryStore } from '../src/storage/universal.js';
import { withMessageVersions } from '../src/storage/message-versions.js';
import { readLink } from '../src/sources/telegram-account-live.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = withMessageVersions(createMemoryStore());
const message = (body, extra = {}) => ({
  id: 'msg:telegram:42:1',
  source: 'telegram',
  chat: '42',
  chatName: 'Ann Lee',
  chatType: 'personal_chat',
  sender: '42',
  senderName: 'Ann Lee',
  timestamp: new Date().toISOString(),
  body,
  raw: { id: 1 },
  ...extra,
});
await store.put(message('Original message'));
await store.put({
  ...message('Deleted context'),
  id: 'msg:telegram:42:3',
  raw: { id: 3 },
  deleted: true,
});
await store.put({
  ...message('Conversation context'),
  id: 'msg:telegram:42:2',
  raw: { id: 2 },
});
await store.put(
  message('Edited message', {
    raw: {
      id: 1,
      editDate: 1793181660,
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 6 }],
    },
  })
);
const { page, base, errors, finish } = await openChatApp('message-versions', {
  store,
});
const dialog = (view) => view.locator('[data-dialog="message-versions"]');
const openHistory = async (view) => {
  await view.locator('[data-action="edited-open"]').click();
  await view.locator('[data-edited-id]').first().click();
  await dialog(view).waitFor();
};
const sharedRow = async (view) => {
  await view.locator('[data-bar="deleted"]').waitFor();
  await view.locator('[data-bar="edited"]').waitFor();
  const groups = await view
    .locator('.chat-history-bar > [data-bar]')
    .evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { y: rect.y, height: rect.height };
      })
    );
  assert(
    groups.length === 2 &&
      Math.abs(groups[0].y - groups[1].y) < 1 &&
      Math.abs(groups[0].height - groups[1].height) < 1,
    'deleted and edited controls share one aligned row'
  );
};
await finish(async () => {
  await page.goto(base);
  await page.locator('[data-chat="telegram:42"]').click();
  await sharedRow(page);
  await openHistory(page);
  await dialog(page).getByText('Original message', { exact: true }).waitFor();
  assert(
    (await dialog(page)
      .locator('.version-body strong', { hasText: 'Edited' })
      .count()) === 1,
    'original formatting survives'
  );
  assert(
    (await dialog(page).locator('[data-version]').count()) === 2,
    'two versions, no duplicated chat messages'
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page
    .locator('[data-row="msg:telegram:42:1"] .bubble')
    .click({ button: 'right' });
  await page.locator('[role="menu"] [data-action="editHistory"]').click();
  await dialog(page).getByText('Original message', { exact: true }).waitFor();

  const browser = page.context().browser();
  await page.close();
  assert(
    browser.contexts().every((context) => context.pages().length === 0),
    'no browser client is open during capture'
  );
  await store.put(message('Captured while closed'));
  await store.put({ ...(await store.get(message('').id)), deleted: true });
  const reopened = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  reopened.on('pageerror', (error) => errors.push(String(error)));
  // Provider is unavailable; history still comes entirely from the local store.
  await reopened.route('**/api/telegram/status', (route) =>
    fulfil(route, { connected: false, offline: true })
  );
  await reopened.goto(base);
  await reopened.locator('[data-chat="telegram:42"]').click();
  await openHistory(reopened);
  await dialog(reopened)
    .getByText('Captured while closed', { exact: true })
    .waitFor();
  assert(
    (await dialog(reopened).locator('[data-version]').count()) === 3,
    'headless edit retained after deletion and client restart'
  );
  await reopened.keyboard.press('Escape');
  await reopened.keyboard.press('Escape');
  await reopened.locator('[data-action="deleted-open"]').click();
  await reopened.locator('[data-action="deleted-versions"]').click();
  await dialog(reopened)
    .getByText('Original message', { exact: true })
    .waitFor();
  await reopened.keyboard.press('Escape');
  await reopened.keyboard.press('Escape');

  const { deleted: _deleted, ...restored } = await store.get(message('').id);
  await store.put(restored);
  await store.put(
    readLink('42', { unreadCount: 1, inboxMaxId: 0, unreadTopId: 2 })
  );
  await reopened.route('**/api/telegram/status', (route) =>
    fulfil(route, { connected: true, kind: 'user' })
  );
  await reopened.route('**/api/telegram/history', (route) =>
    fulfil(route, { written: 0, complete: true })
  );
  await reopened.route('**/api/telegram/dialog-state', async (route) =>
    fulfil(route, { ok: true, read: await store.get('read:telegram:42') })
  );
  await reopened.goto(`${base}/#/operator`);
  await reopened.locator('[data-operator-chat="telegram:42"]').waitFor();
  await sharedRow(reopened);
  await openHistory(reopened);
  await dialog(reopened)
    .getByText('Original message', { exact: true })
    .waitFor();
  await reopened.keyboard.press('Escape');
  await reopened.keyboard.press('Escape');
  for (let index = 0; index < 52; index += 1) {
    await store.put({ ...restored, body: `More edits ${index}` });
  }
  await reopened.reload();
  await reopened.locator('[data-operator-chat="telegram:42"]').waitFor();
  await openHistory(reopened);
  await dialog(reopened).getByText('More edits 51', { exact: true }).waitFor();
  await dialog(reopened)
    .locator('.reader-body')
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  await dialog(reopened)
    .getByText('Original message', { exact: true })
    .waitFor();
  assert(
    (await dialog(reopened).locator('[data-version]').count()) === 55,
    'older history loads automatically on scroll'
  );
});
