// Real browser e2e for the pinned messages list, similar channels and fact
// checks (R-Y166), as Telegram Desktop has them: with three pinned the bar
// gets a list button that opens "3 pinned messages", a click goes to the
// message, "Unpin" takes one away, "Unpin all messages" asks in the page
// and the fake records it; a member who may not unpin gets "Hide pinned
// messages" (kept per chat, shown again for a new pin); a channel's info
// column lists similar channels (a known one opens, another shows its
// preview and Join); a fact-checked message shows its box, the text asked
// for only when needed. Telegram's answers faked in the page, fake chats in
// a memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:pinned-list

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ADMIN = '-1001';
const MEMBER = '-1002';
const CHANNEL = '-1003';
const KNOWN = '-1004';
const UNKNOWN = '-1099';
const CHATS = [
  [ADMIN, 'Admin Group', 'supergroup', 3],
  [MEMBER, 'Member Group', 'supergroup', 3],
  [CHANNEL, 'Daily News', 'channel', 0],
  [KNOWN, 'Known Channel', 'channel', 0],
];
const INFO = {
  [ADMIN]: { kind: 'channel', title: 'Admin Group', canPin: true, pinned: 3 },
  [MEMBER]: {
    kind: 'channel',
    title: 'Member Group',
    canPin: false,
    pinned: 3,
  },
  [CHANNEL]: { kind: 'channel', title: 'Daily News', broadcast: true },
};
const at = Date.now() - 600_000;
const store = createMemoryStore();
for (const [chat, name, type, pinnedUpTo] of CHATS) {
  for (let n = 1; n <= 6; n += 1) {
    const factcheck =
      chat === CHANNEL && n === 5
        ? { needCheck: true, hash: '1' }
        : chat === CHANNEL && n === 6
          ? {
              country: 'DE',
              hash: '2',
              text: { text: 'Already checked', entities: [] },
            }
          : undefined;
    await store.put({
      id: `msg:telegram:${chat}:${n}`,
      source: 'telegram',
      chat,
      chatName: name,
      chatType: type,
      sender: '7',
      senderName: 'Ann Lee',
      body: `Message ${n}`,
      timestamp: new Date(at + n * 60_000).toISOString(),
      raw: {
        id: n,
        ...(n <= pinnedUpTo ? { pinned: true } : {}),
        ...(factcheck ? { factcheck } : {}),
      },
    });
  }
}

const { base, page, until, finish } = await openChatApp('pinned-list', {
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
const calls = [];
const record = (name, answer) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    calls.push([name, body]);
    return fulfil(route, typeof answer === 'function' ? answer(body) : answer);
  });
const pinnedLink = (chat, n) => ({
  id: `msg:telegram:${chat}:${n}`,
  source: 'telegram',
  chat,
  body: `Pinned ${n}`,
  senderName: 'Ann Lee',
  timestamp: new Date(at + n * 60_000).toISOString(),
  raw: { id: n, pinned: true },
});
await record('pinned-list', (body) => ({
  ok: true,
  messages: [3, 2, 1].map((n) => pinnedLink(body.chat, n)),
  count: 3,
  next: null,
}));
await record('pin', { ok: true, pinned: null });
await record('unpin-all', { ok: true });
await record('similar-channels', {
  ok: true,
  channels: [
    { chat: KNOWN, title: 'Known Channel', members: 1200, broadcast: true },
    { chat: UNKNOWN, title: 'Far Away', members: 55, broadcast: true },
  ],
});
await record('similar-join', (body) => ({ ok: true, chat: body.chat }));
await record('fact-checks', (body) => ({
  ok: true,
  items: body.ids.map((id) => ({
    id,
    country: 'DE',
    text: 'Context from the checkers',
    entities: [{ className: 'MessageEntityBold', offset: 0, length: 7 }],
  })),
}));

const called = (name) => calls.filter(([n]) => n === name).map(([, b]) => b);
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('.chat-header').waitFor({ timeout: 10000 });
};
const list = page.locator('[data-dialog="pinned-list"]');

const adminSteps = async () => {
  // Three pinned: the list button, "3 pinned messages", a click goes there.
  await open(ADMIN);
  await page.locator('.chat-pinned-bar').waitFor({ timeout: 10000 });
  await page.locator('[data-action="pinned-list-open"]').click();
  await list.locator('[data-pinned-item="1"]').waitFor({ timeout: 5000 });
  const title = await list.locator('.comments-head-text').textContent();
  assert(title === '3 pinned messages', `title: ${title}`);
  const order = await list
    .locator('[data-pinned-item]')
    .evaluateAll((all) => all.map((n) => n.dataset.pinnedItem));
  assert(order.join() === '3,2,1', `order: ${order}`);
  assert(
    (await list.locator('[data-action="unpin-all"]').count()) === 1,
    'Unpin all at the bottom'
  );
  await list
    .locator('[data-pinned-item="1"] [data-action="pinned-go"]')
    .click();
  await until(async () => (await list.count()) === 0, 'the list closes');
  await until(
    async () =>
      (await page
        .locator(`[data-message="msg:telegram:${ADMIN}:1"].is-found`)
        .count()) > 0,
    'the message is shown'
  );

  // Unpin one: asked of Telegram, gone from the list.
  await page.locator('[data-action="pinned-list-open"]').click();
  await list
    .locator('[data-pinned-item="2"] [data-action="pinned-unpin"]')
    .click();
  await until(
    async () => called('pin').some((b) => b.id === 2 && b.unpin === true),
    'unpin sent'
  );
  await until(
    async () => (await list.locator('[data-pinned-item]').count()) === 2,
    'the item is gone'
  );

  // Unpin all: asked in the page, then recorded; the bar goes.
  await list.locator('[data-action="unpin-all"]').click();
  const ask = page.locator('[data-dialog="unpin-all"]');
  await ask.waitFor({ timeout: 5000 });
  assert(called('unpin-all').length === 0, 'nothing sent before the answer');
  await ask.locator('[data-action="unpin-all-confirm"]').click();
  await until(() => called('unpin-all').length === 1, 'unpin all sent');
  assert(called('unpin-all')[0].chat === ADMIN, 'for the chat');
  await until(
    async () => (await page.locator('.chat-pinned-bar').count()) === 0,
    'the bar goes'
  );
};
const memberSteps = async () => {
  // A member who may not unpin: Hide pinned messages, kept per chat.
  await open(MEMBER);
  await page.locator('[data-action="pinned-list-open"]').click();
  assert(
    (await list.locator('[data-action="pinned-unpin"]').count()) === 0,
    'no Unpin for a member'
  );
  assert(
    (await list.locator('[data-action="unpin-all"]').count()) === 0,
    'no Unpin all for a member'
  );
  await list.locator('[data-action="pinned-hide"]').click();
  await until(
    async () => (await page.locator('.chat-pinned-bar').count()) === 0,
    'the bar is hidden'
  );
  const key = await page.evaluate(() =>
    Object.keys(globalThis.localStorage).find(
      (k) => k.startsWith('ms.pinnedHidden:') && k.includes('-1002')
    )
  );
  assert(key && key.includes(MEMBER), `kept per chat: ${key}`);
  assert(called('unpin-all').length === 1, 'hiding unpins nothing');
  await page.reload();
  await open(MEMBER);
  await page.waitForTimeout(600);
  assert(
    (await page.locator('.chat-pinned-bar').count()) === 0,
    'still hidden after a reload'
  );
  // A new pin (another newest id) shows the bar again.
  await page.evaluate(
    (k) => globalThis.localStorage.setItem(k, 'msg:older'),
    key
  );
  await page.reload();
  await open(MEMBER);
  await page.locator('.chat-pinned-bar').waitFor({ timeout: 10000 });
};
const channelSteps = async () => {
  // A channel: fact checks, only the one that needs it asked for.
  await open(CHANNEL);
  const boxes = page.locator('[data-fact-check]');
  await until(async () => (await boxes.count()) === 2, 'two fact check boxes');
  const texts = await boxes.allTextContents();
  assert(
    texts.some((t) => t.includes('Already checked') && t.includes('Germany')),
    `own text: ${texts}`
  );
  assert(
    texts.some((t) => t.includes('Context from the checkers')),
    `fetched text: ${texts}`
  );
  assert(
    texts.every((t) => t.includes('Fact check')),
    'titled'
  );
  const asked = called('fact-checks');
  assert(
    asked.length === 1 && asked[0].ids.join() === '5',
    `asked: ${JSON.stringify(asked)}`
  );
};
const similarSteps = async () => {
  // Similar channels in the info column.
  if ((await page.locator('.person-panel').count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  const cards = page.locator('.person-panel [data-similar-channel]');
  await until(async () => (await cards.count()) === 2, 'two similar channels');
  const first = await cards.first().textContent();
  assert(first.includes('Known Channel') && first.includes('1,200'), first);
  await page.locator(`[data-similar-channel="${UNKNOWN}"]`).click();
  const preview = page.locator('[data-dialog="similar-preview"]');
  await preview.waitFor({ timeout: 5000 });
  assert(
    (await preview.textContent()).includes('Far Away'),
    'the preview names it'
  );
  assert(called('similar-join').length === 0, 'nothing joined yet');
  await preview.locator('[data-action="similar-join"]').click();
  await until(() => called('similar-join').length === 1, 'join sent');
  assert(called('similar-join')[0].chat === UNKNOWN, 'joined the one');
  await until(
    async () =>
      (await page.locator(`[data-chat="telegram:${UNKNOWN}"]`).count()) > 0,
    'the joined channel opens in the app'
  );
  await open(CHANNEL);
  if ((await page.locator('.person-panel').count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await cards.first().waitFor({ timeout: 5000 });
  await page.locator(`[data-similar-channel="${KNOWN}"]`).click();
  await until(
    async () =>
      (await page.locator('.chat-header').textContent()).includes(
        'Known Channel'
      ),
    'a known channel opens at once'
  );
  assert(called('similar-join').length === 1, 'a known channel is not joined');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await adminSteps();
  await memberSteps();
  await channelSteps();
  await similarSteps();
});
