// Real browser e2e for the bar over a chat with a stranger (R-Y137), as
// Telegram Desktop shows it: "Not a contact" with when they registered
// and their number's country, then what Telegram offers — Add to
// contacts, Share my phone number, Block user, Report spam — each asked
// in the page as in the info column, the bar gone once acted on; × hides
// it for good. Telegram's answers faked in the page, fake chats in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:peer-bar

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const GROUP = '-1005';
const BARS = {
  [ANN]: {
    addContact: true,
    blockContact: true,
    reportSpam: true,
    registered: '03.2024',
    country: 'DE',
  },
  [BOB]: { shareContact: true },
  [GROUP]: { reportSpam: true },
};
const store = createMemoryStore();
for (const [chat, name, type] of [
  [ANN, 'Ann Lee', 'private'],
  [BOB, 'Bob Ray', 'private'],
  [GROUP, 'Fake Group', 'supergroup'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('peer-bar', {
  store,
  // 200 MB free: the page warns that the disk is almost full (R-Z14).
  serverOptions: { diskFree: async () => 200 * 1024 * 1024 },
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const calls = [];
for (const name of [
  'peer-settings',
  'peer-block',
  'peer-share-contact',
  'peer-hide-bar',
]) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    calls.push([name, body.chat]);
    return fulfil(
      route,
      name === 'peer-settings'
        ? { ok: true, bar: BARS[body.chat] ?? {} }
        : { ok: true, blocked: true }
    );
  });
}

const bar = page.locator('.peer-bar');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator(`[data-peer-bar="${chat}"]`).waitFor({ timeout: 10000 });
};
const done = (name, chat) => calls.some(([n, c]) => n === name && c === chat);

await finish(async () => {
  await page.goto(`${base}/`);

  // The disk-almost-full notice (R-Z14): shown, then hidden for the session.
  const banner = page.locator('.disk-banner');
  await banner.waitFor({ timeout: 10000 });
  assert(
    (await banner.textContent()).includes('Disk almost full'),
    'the banner says the disk is almost full'
  );
  await banner.locator('[data-action="disk-banner-dismiss"]').click();
  await until(async () => (await banner.count()) === 0, 'the banner goes');

  // A stranger: who they are, and Telegram's three offers in order.
  await open(ANN);
  const info = await bar.locator('.peer-bar-info').textContent();
  assert(info.startsWith('Not a contact'), `info: ${info}`);
  assert(info.includes('03.2024') && info.includes('Germany'), info);
  const actions = await bar
    .locator('.peer-bar-actions [data-action]')
    .evaluateAll((list) => list.map((b) => b.dataset.action));
  assert(actions.join() === 'bar-add,bar-block,bar-spam', `offers: ${actions}`);
  // Block: asked in the page; the bar goes once blocked.
  await bar.locator('[data-action="bar-block"]').click();
  const ask = page.locator('[data-dialog="block"]');
  await ask.locator('[data-action="block-confirm"]').click();
  await until(() => done('peer-block', ANN), 'blocked');
  await until(async () => (await bar.count()) === 0, 'the bar goes');

  // Share my phone number: at once; the bar goes.
  await open(BOB);
  await bar.locator('[data-action="bar-share"]').click();
  await until(() => done('peer-share-contact', BOB), 'shared');
  await until(async () => (await bar.count()) === 0, 'the bar goes');

  // A group: ×, hidden for good.
  await open(GROUP);
  assert(
    (await bar.locator('[data-action="bar-spam"]').count()) === 1,
    'Report spam in a group'
  );
  await bar.locator('[data-action="bar-hide"]').click();
  await until(() => done('peer-hide-bar', GROUP), 'hidden');
  assert((await bar.count()) === 0, 'the bar is gone');
});
