// Real browser e2e for a chat's deleted messages (R-Z7): the bar over the
// chat says how many are kept, the list shows them, Recover brings one
// back into the chat, Erase asks first (Escape closes the question) and
// only then erases. Nothing reaches a network. Run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:deleted

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const at = (n) => new Date(Date.now() - n * 60_000).toISOString();
const msg = (n, extra = {}) => ({
  id: `msg:telegram:${ANN}:${n}`,
  source: 'telegram',
  chat: ANN,
  chatName: 'Ann Lee',
  chatType: 'private',
  sender: ANN,
  senderName: 'Ann Lee',
  body: `message ${n}`,
  timestamp: at(10 - n),
  raw: { id: n },
  ...extra,
});
const store = createMemoryStore();
await store.put(msg(1));
await store.put(msg(2, { deleted: true }));
await store.put(
  msg(3, {
    deleted: { at: at(1), by: 'telegram', reason: 'deleted-on-network' },
  })
);

const { base, page, until, finish } = await openChatApp('deleted', { store });
const bar = page.locator('[data-bar="deleted"]');
const rows = page.locator('[data-deleted-id]');

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${ANN}"]`).click();
  await bar.waitFor({ timeout: 10000 });
  assert((await bar.textContent()).includes('2 deleted'), 'the bar counts 2');
  assert(
    (await page.locator('.bubble', { hasText: 'message 2' }).count()) === 0,
    'a deleted message is not in the chat'
  );

  await page.locator('[data-action="deleted-open"]').click();
  await page.locator('[data-dialog="deleted-messages"]').waitFor();
  assert((await rows.count()) === 2, 'two rows');

  // Recover: the message is back in the chat, the list has one left.
  await page
    .locator('[data-deleted-id$=":2"] [data-action="deleted-recover"]')
    .click();
  await until(async () => (await rows.count()) === 1, 'one row left');
  assert(!(await store.get(msg(2).id)).deleted, 'the tombstone is gone');

  // Erase asks first; Escape closes the question and nothing is erased.
  await page
    .locator('[data-deleted-id$=":3"] [data-action="deleted-purge"]')
    .click();
  await page.locator('[data-dialog="deleted-purge"]').waitFor();
  await page.keyboard.press('Escape');
  await until(
    async () =>
      (await page.locator('[data-dialog="deleted-purge"]').count()) === 0,
    'question closed by Escape'
  );
  assert((await rows.count()) === 1, 'Escape erased nothing');
  assert(await store.get(msg(3).id), 'still stored');

  await page
    .locator('[data-deleted-id$=":3"] [data-action="deleted-purge"]')
    .click();
  await page.locator('[data-action="purge-confirm"]').click();
  await until(async () => (await rows.count()) === 0, 'row erased');
  assert((await store.get(msg(3).id)) === null, 'erased from the store');
  assert((await store.get(msg(1).id)) !== null, 'a live message stays');
  await page.keyboard.press('Escape');
  await until(
    async () => !(await page.locator('.chat-history-bar').isVisible()),
    'empty history row takes no space'
  );
});
