// Real browser e2e for groups in common (R-Y158), as Telegram Desktop shows
// it in a person's profile: the info column says "N groups in common" when
// the count is above zero, the row opens the list (title, members when
// known), "Show more" asks the next page by the last chat's id, a click on
// a group opens that chat and closes the list; no row for a person with
// none, for a group or for a bot without a count. Telegram's answers faked
// in the page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:common-chats

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ANN = '42';
const BOB = '43';
const BOT = '44';
const GROUP = '-1005';
const CHATS = [
  [ANN, 'Ann Lee', 'private'],
  [BOB, 'Bob Ray', 'private'],
  [BOT, 'Helper Bot', 'private'],
  [GROUP, 'Fake Group', 'supergroup'],
];
const INFO = {
  [ANN]: { kind: 'user', title: 'Ann Lee', commonChats: 3 },
  [BOB]: { kind: 'user', title: 'Bob Ray', commonChats: 0 },
  [BOT]: { kind: 'user', title: 'Helper Bot', bot: true },
  [GROUP]: { kind: 'channel', title: 'Fake Group', commonChats: 5 },
};
const store = createMemoryStore();
for (const [chat, name, type] of CHATS) {
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

const { base, page, until, finish } = await openChatApp('common-chats', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...(INFO[chat] ?? {}) });
});
const asks = [];
await page.route('**/api/telegram/common-chats', (route) => {
  const body = route.request().postDataJSON();
  asks.push(body);
  return fulfil(
    route,
    body.maxId
      ? {
          ok: true,
          chats: [{ chat: '-9', title: 'Old Friends', kind: 'group' }],
          next: null,
        }
      : {
          ok: true,
          chats: [
            {
              chat: '-1006',
              title: 'Rustaceans',
              kind: 'group',
              members: 1200,
            },
            { chat: '-1007', title: 'News', kind: 'channel', members: null },
          ],
          next: '1007',
        }
  );
});

const row = page.locator('.person-panel [data-action="common-chats-open"]');
const list = page.locator('[data-dialog="common-chats"]');
const openAbout = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  const about = page.locator('.person-panel');
  if ((await about.count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await about.waitFor({ timeout: 10000 });
  await until(
    async () => (await page.locator('.person-panel-body').count()) > 0,
    'the panel'
  );
};

await finish(async () => {
  await page.goto(`${base}/`);

  // A person with groups in common: the count, the list, more, a click.
  await openAbout(ANN);
  await row.waitFor({ timeout: 10000 });
  const text = await row.textContent();
  assert(text.trim() === '3 groups in common', `row: ${text}`);
  await row.click();
  await list.locator('[data-common-chat="-1006"]').waitFor({ timeout: 5000 });
  const first = await list.textContent();
  assert(
    first.includes('Rustaceans') && first.includes('1,200 members'),
    `list: ${first}`
  );
  assert(first.includes('News'), 'the channel listed');
  await list.locator('[data-action="common-more"]').click();
  await list.locator('[data-common-chat="-9"]').waitFor({ timeout: 5000 });
  assert(asks.length === 2, `two pages asked: ${JSON.stringify(asks)}`);
  assert(asks[0].chat === ANN && asks[0].maxId === undefined, 'first page');
  assert(asks[1].maxId === '1007', `paged by the last id: ${asks[1].maxId}`);
  assert(
    (await list.locator('[data-action="common-more"]').count()) === 0,
    'no more after the last page'
  );
  await list.locator('[data-common-chat="-1006"]').click();
  await until(async () => (await list.count()) === 0, 'the list closes');
  await until(
    async () =>
      (await page.locator('[data-chat="telegram:-1006"]').count()) > 0,
    'the group opens in the app'
  );

  // Nothing to show: no row for none, for a group, for a bot.
  for (const chat of [BOB, GROUP, BOT]) {
    await openAbout(chat);
    await page.waitForTimeout(500);
    assert((await row.count()) === 0, `no row for ${chat}`);
  }
});
