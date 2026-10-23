// Real browser e2e for pinning chats in Saved Messages (R-Y174), as
// Telegram Desktop has it: in "View as chats" each sub-chat has Pin or
// Unpin; pinned ones show first with a pin icon. Nothing is sent until the
// click; a refusal is shown as text. Telegram's answers faked in the page,
// a fake chat in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:saved-pins

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ME = '6';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${ME}:1`,
  source: 'telegram',
  chat: ME,
  chatName: 'Saved Messages',
  chatType: 'private',
  sender: 'me',
  senderName: 'Me',
  body: 'hello',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('saved-pins', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: ME,
    kind: 'user',
    title: 'Saved Messages',
    self: true,
  })
);

// The pins, newest first, as Telegram keeps them.
let pins = ['44'];
const dialogs = [
  ['42', 'Ann Lee'],
  ['43', 'Bob Ray'],
  ['44', 'Cara Fox'],
];
// Telegram lists pinned chats first.
const listed = () =>
  [
    ...pins.map((peer) => dialogs.find((d) => d[0] === peer)),
    ...dialogs.filter((d) => !pins.includes(d[0])),
  ].map(([peer, name], i) => ({
    peer,
    kind: 'user',
    name,
    id: i + 1,
    date: Date.now() - (i + 1) * 60_000,
    preview: `saved from ${name}`,
    media: null,
    pinned: pins.includes(peer),
  }));
await page.route('**/api/telegram/saved-dialogs', (route) =>
  fulfil(route, { ok: true, dialogs: listed(), complete: true, next: null })
);
const sent = [];
let reply = { ok: true };
await page.route('**/api/telegram/saved-pin', (route) => {
  const body = route.request().postDataJSON();
  sent.push(body);
  if (reply.ok) {
    pins = body.pinned
      ? [body.peer, ...pins]
      : pins.filter((peer) => peer !== body.peer);
  }
  return fulfil(route, reply.ok ? { ok: true, pinned: body.pinned } : reply);
});

const order = async () =>
  (
    await page
      .locator('[data-saved="chats"] [data-saved-peer]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.savedPeer))
  ).join(',');
const row = (peer) =>
  page.locator(`.saved-dialog-item:has([data-saved-peer="${peer}"])`);

const steps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${ME}"]`).click();
  await page.locator('[data-action="saved-view"]').click({ timeout: 10000 });
  await page.locator('[data-saved-peer="42"]').waitFor({ timeout: 5000 });
  assert((await order()) === '44,42,43', `pinned first: ${await order()}`);
  assert(
    (await row('44').locator('.saved-pinned-mark').count()) === 1,
    'a pin icon on the pinned one'
  );
  assert(
    (await row('42').locator('.saved-pinned-mark').count()) === 0,
    'no icon on the others'
  );
  assert(sent.length === 0, 'nothing sent before a click');
  assert(
    (await row('44')
      .locator('[data-action="saved-unpin"]')
      .getAttribute('title')) === 'Unpin',
    'Unpin on the pinned one'
  );

  // Pin Bob: Telegram puts a new pin on top.
  await row('43').locator('[data-action="saved-pin"]').click();
  await until(() => sent.length === 1, 'pin sent');
  assert(
    JSON.stringify(sent[0]) === JSON.stringify({ peer: '43', pinned: true }),
    `pin body: ${JSON.stringify(sent[0])}`
  );
  await until(async () => (await order()) === '43,44,42', 'Bob listed first');
  assert(
    (await row('43').locator('.saved-pinned-mark').count()) === 1,
    'Bob has the icon'
  );

  // Unpin Cara.
  await row('44').locator('[data-action="saved-unpin"]').click();
  await until(() => sent.length === 2, 'unpin sent');
  assert(sent[1].pinned === false && sent[1].peer === '44', 'unpin body');
  await until(async () => (await order()) === '43,42,44', 'Cara last');

  // A refusal is text and changes nothing.
  reply = { ok: false, error: 'x', code: 'no-access' };
  await row('42').locator('[data-action="saved-pin"]').click();
  await until(() => sent.length === 3, 'third asked');
  await page.locator('[data-saved-error]').waitFor();
  assert((await order()) === '43,42,44', 'the order is unchanged');
};

await finish(steps);
