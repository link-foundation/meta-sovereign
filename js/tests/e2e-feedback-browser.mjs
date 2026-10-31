import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const msg = (id, count, patch = {}) => ({
  id: `msg:telegram:-1005:${id}`,
  source: 'telegram',
  chat: '-1005',
  chatName: 'Feedback fixture',
  chatType: 'supergroup',
  sender: 'me',
  body: `Feedback message ${id}`,
  timestamp: `2026-10-${id}T00:00:00.000Z`,
  raw: {
    id,
    reactions: {
      canSeeList: true,
      results: [{ reaction: { emoticon: '🔥' }, count }],
    },
  },
  ...patch,
});
await store.put(msg(10, 7));
await store.put(
  msg(11, 3, {
    raw: {
      id: 11,
      reactions: {
        canSeeList: false,
        results: [{ reaction: { emoticon: '👍' }, count: 3 }],
      },
    },
  })
);
await store.put(msg(12, 100, { sender: 'other' }));
const calls = [];
const telegramAccount = {
  status: () => ({ connected: true }),
  close: async () => {},
  messageReactors: async (options) => {
    calls.push(options);
    return {
      ok: true,
      items: [
        {
          peer: options.offset ? '8' : '7',
          kind: 'user',
          name: options.offset ? 'Bob' : 'Alice',
          emoji: '🔥',
          date: 1700000000000,
        },
      ],
      next: options.offset ? null : 'page2',
    };
  },
};
const { page, base, until, finish } = await openChatApp('feedback', {
  store,
  telegramAccount,
});
await finish(async () => {
  await page.goto(`${base}/#/feedback`);
  const cards = page.locator('[data-feedback-message]');
  await until(
    async () => (await cards.count()) === 2,
    'only own messages ranked'
  );
  assert(
    (await cards.first().getAttribute('data-feedback-message')) === msg(10).id,
    'highest score first'
  );
  await cards.first().locator('[data-action="feedback-authors"]').click();
  const dialog = page.locator('[data-dialog="feedback-authors"]');
  await dialog.locator('[data-feedback-peer="7"]').waitFor();
  assert(
    calls.length === 1,
    `opening collects one page automatically (${calls.length}: ${JSON.stringify(calls)})`
  );
  await dialog.locator('[data-action="feedback-collect"]').click();
  await dialog.locator('[data-feedback-peer="8"]').waitFor();
  await dialog
    .locator('[data-feedback-peer="7"] [data-action="feedback-profile"]')
    .click();
  const profile = page.locator('[data-dialog="feedback-person"]');
  await profile.locator('[data-person-reactions]').waitFor();
  assert(
    (await profile.textContent()).includes('Feedback message 10'),
    'profile shows reaction evidence'
  );
  await page.keyboard.press('Escape');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await cards.nth(1).locator('[data-action="feedback-authors"]').click();
  await dialog.waitFor();
  await until(
    async () => (await dialog.textContent()).includes('anonymous'),
    'anonymous limitation is explicit'
  );
  assert(calls.length === 2, 'hidden authors never queried');
  await page.keyboard.press('Escape');
  await cards.first().locator('[data-action="feedback-open-message"]').click();
  await page.locator('[data-message="msg:telegram:-1005:10"]').waitFor();
  assert(page.url().includes('message=msg'), 'original message is targeted');
  await page.locator('button[data-view="settings"]').click();
  const enabled = page.locator('[data-action="feedback-enabled"]');
  await enabled.waitFor();
  await enabled.uncheck();
  await until(
    async () => (await store.get('feedback:settings'))?.enabled === false,
    'opt-out persisted'
  );
});
