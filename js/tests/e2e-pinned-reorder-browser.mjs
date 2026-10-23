// Real browser e2e for reordering the pinned chats (R-Y159): the third
// pinned chat is dragged to the top (the list shows the new order at once
// and /api/telegram/pinned-reorder gets the exact order); an unpinned chat
// cannot be dragged; "Move up" / "Move down" in a pinned chat's context
// menu do the same from the keyboard; a refusal puts the old order back
// with a short notice. Fake chats in a memory store, Telegram's answers
// faked in the page, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:pinned-reorder

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const store = createMemoryStore();
const CHATS = [
  ['111', 'Fake Ann', 1],
  ['222', 'Fake Bob', 2],
  ['333', 'Fake Cy', 3],
  ['444', 'Fake Di', 0],
  ['555', 'Fake Ed', 0],
];
const at = Date.now();
const putRank = (chat, pinnedRank) =>
  store.put({
    id: `read:telegram:${chat}`,
    tokens: ['read', 'telegram', chat],
    kind: 'read',
    source: 'telegram',
    chat,
    inboxMaxId: 1,
    folder: 0,
    pinnedRank,
  });
for (const [i, [chat, name, rank]] of CHATS.entries()) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'user',
    sender: chat,
    senderName: name,
    body: `hello from ${name}`,
    // The pinned 333 is the oldest: date never decides their place.
    timestamp: new Date(at - (i + 1) * 60_000).toISOString(),
    raw: { id: 1 },
  });
  await putRank(chat, rank);
}

const { base, page, until, finish } = await openChatApp('pinned-reorder', {
  store,
});
const asked = [];
let refuse = false;
await page.route('**/api/telegram/pinned-reorder', async (route) => {
  const body = route.request().postDataJSON();
  asked.push(body);
  if (refuse) {
    return fulfil(route, { ok: false, error: 'PINNED_DIALOGS_TOO_MUCH' });
  }
  // As the server does: Telegram's order becomes the pinned ranks.
  for (const [n, chat] of body.chats.entries()) {
    await putRank(chat, n + 1);
  }
  return fulfil(route, { ok: true, folder: body.folder, chats: body.chats });
});

const order = () =>
  page.$$eval('.chat-list .chat-item[data-chat]', (rows) =>
    rows.map((r) => r.dataset.chat.replace('telegram:', ''))
  );
const sameOrder = async (want, what) => {
  await until(
    async () => (await order()).join() === want.join(),
    `${what}: ${want.join()} (now ${(await order()).join()})`
  );
};
const row = (chat) => page.locator(`.chat-list [data-chat="telegram:${chat}"]`);

const dragTo = async (from, to, above = true) => {
  const a = await row(from).boundingBox();
  const b = await row(to).boundingBox();
  const y = above ? b.y + 4 : b.y + b.height - 4;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    const f = i / steps;
    await page.mouse.move(
      a.x + a.width / 2,
      a.y + a.height / 2 + (y - (a.y + a.height / 2)) * f
    );
  }
  return a;
};

const menuMove = async (chat, action) => {
  await row(chat).click({ button: 'right' });
  const item = page.locator(`.msg-context-menu [data-action="${action}"]`);
  await item.waitFor({ timeout: 5000 });
  await item.click();
};

await finish(async () => {
  await page.goto(`${base}/#chat=telegram:111`);
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
  await page.locator('[data-chat="telegram:555"]').waitFor();
  await sameOrder(['111', '222', '333', '444', '555'], 'Telegram order');
  assert((await row('111').getAttribute('data-pinned')) !== null, 'pinned');
  assert((await row('444').getAttribute('data-pinned')) === null, 'unpinned');

  // Drag the third pinned chat to the top: a lifted row, rows sliding.
  await dragTo('333', '111');
  await until(
    () => row('333').evaluate((r) => r.classList.contains('is-lifted')),
    'the dragged row is lifted'
  );
  assert(
    await page.locator('.chat-list.is-pin-dragging').count(),
    'the list shows a drag'
  );
  await page.mouse.up();
  await sameOrder(['333', '111', '222', '444', '555'], 'dropped at the top');
  await until(async () => asked.length === 1, 'asked Telegram');
  assert(
    JSON.stringify(asked[0]) ===
      JSON.stringify({ folder: 0, chats: ['333', '111', '222'] }),
    `sent: ${JSON.stringify(asked[0])}`
  );
  assert(
    (await page.locator('.is-lifted').count()) === 0,
    'no row stays lifted'
  );
  // Still in that order once Telegram's own order has come back.
  await page.waitForTimeout(600);
  await sameOrder(['333', '111', '222', '444', '555'], 'order kept');

  // The drag did not open or change the open chat.
  assert(
    (await page.evaluate(() => globalThis.location.hash)) ===
      '#chat=telegram:111',
    'the drag is not a click'
  );

  // An unpinned chat cannot be dragged.
  await dragTo('444', '333');
  await page.mouse.up();
  await page.waitForTimeout(400);
  await sameOrder(['333', '111', '222', '444', '555'], 'unpinned stays');
  assert(asked.length === 1, 'nothing asked for an unpinned chat');

  // The menu: Move up / Move down, and not where they cannot move.
  await row('333').click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
  assert(
    (await page.locator('.msg-context-menu [data-action="pinUp"]').count()) ===
      0,
    'the top one cannot move up'
  );
  assert(
    (await page
      .locator('.msg-context-menu [data-action="pinDown"]')
      .count()) === 1,
    'the top one can move down'
  );
  await page.keyboard.press('Escape');
  await row('222').click({ button: 'right' });
  assert(
    (await page
      .locator('.msg-context-menu [data-action="pinDown"]')
      .count()) === 0,
    'the last pinned one cannot move down'
  );
  await page.keyboard.press('Escape');
  await menuMove('222', 'pinUp');
  await sameOrder(['333', '222', '111', '444', '555'], 'moved up');
  await until(async () => asked.length === 2, 'asked for the move');
  assert(
    JSON.stringify(asked[1].chats) === JSON.stringify(['333', '222', '111']),
    `sent: ${JSON.stringify(asked[1])}`
  );
  await menuMove('333', 'pinDown');
  await sameOrder(['222', '333', '111', '444', '555'], 'moved down');
  await until(async () => asked.length === 3, 'asked again');

  // A refusal puts the old order back, with a short notice.
  refuse = true;
  await menuMove('111', 'pinUp');
  await until(async () => asked.length === 4, 'asked and refused');
  await sameOrder(['222', '333', '111', '444', '555'], 'old order back');
  await page
    .getByText('The pinned chats could not be reordered.')
    .first()
    .waitFor({ timeout: 5000 });
});
