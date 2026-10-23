// Real browser e2e for hiding the stories of a person from the strip
// (R-Y174), as Telegram Desktop has it: a right click on an entry offers
// "Hide stories"; nothing is sent until the item is clicked; the entry then
// leaves the strip at once and "Hidden stories" lists it, where the right
// click offers "Unhide stories" and the entry returns. One's own entry has
// no such menu. Telegram's answers faked in the page, fake chats in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:strip-hide

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const ME = '7';
const ANN = '42';
const BOB = '43';
const store = createMemoryStore();
for (const [chat, name] of [
  [ANN, 'Ann Lee'],
  [BOB, 'Bob Ray'],
]) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
}

const head = (peer, name, extra = {}) => ({
  peer,
  name,
  self: false,
  count: 1,
  lastId: 5,
  maxReadId: 0,
  unread: true,
  ...extra,
});
const all = [
  head(ME, 'Me', { self: true, unread: false }),
  head(ANN, 'Ann Lee'),
  head(BOB, 'Bob Ray'),
];
const away = new Set();

const { base, page, until, finish } = await openChatApp('strip-hide', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/stories', (route) => {
  const hidden = Boolean(route.request().postDataJSON()?.hidden);
  return fulfil(route, {
    ok: true,
    peers: all.filter((p) => away.has(p.peer) === hidden),
    state: 'S',
    more: false,
  });
});
const sent = [];
await page.route('**/api/telegram/stories-hide', (route) => {
  const body = route.request().postDataJSON();
  sent.push(body);
  if (body.hidden) {
    away.add(body.chat);
  } else {
    away.delete(body.chat);
  }
  return fulfil(route, { ok: true, hidden: body.hidden });
});

const entry = (peer) => page.locator(`[data-story-peer="${peer}"]`);
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

const steps = async () => {
  await page.goto(`${base}/`);
  await entry(ANN).waitFor({ timeout: 10000 });
  assert(sent.length === 0, 'nothing sent before a click');

  // One's own entry has no menu.
  await entry(ME).click({ button: 'right' });
  assert(
    (await page.locator('[data-action="strip-story-hide"]').count()) === 0,
    'no menu on one’s own entry'
  );

  // Right click: Hide stories; Escape closes the menu and sends nothing.
  await entry(ANN).click({ button: 'right' });
  const item = page.locator('[data-action="strip-story-hide"]');
  await item.waitFor();
  assert((await item.textContent()) === 'Hide stories', 'the item says Hide');
  await page.keyboard.press('Escape');
  await gone(item, 'Escape closes the menu');
  assert(sent.length === 0, 'closing sends nothing');

  await entry(ANN).click({ button: 'right' });
  await item.click();
  await until(() => sent.length === 1, 'hide sent');
  assert(
    JSON.stringify(sent[0]) === JSON.stringify({ chat: ANN, hidden: true }),
    `hide body: ${JSON.stringify(sent[0])}`
  );
  await gone(entry(ANN), 'Ann leaves the strip at once');
  assert((await entry(BOB).count()) === 1, 'Bob stays');

  // The hidden list holds her; the right click offers Unhide.
  await page.locator('[data-action="stories-hidden"]').click();
  await entry(ANN).waitFor();
  await entry(ANN).click({ button: 'right' });
  assert(
    (await item.textContent()) === 'Unhide stories',
    'the item says Unhide'
  );
  await item.click();
  await until(() => sent.length === 2, 'unhide sent');
  assert(sent[1].hidden === false && sent[1].chat === ANN, 'unhide body');
  // Back in the strip: Bob shows with her again.
  await entry(BOB).waitFor();
  await entry(ANN).waitFor();
};

await finish(steps);
