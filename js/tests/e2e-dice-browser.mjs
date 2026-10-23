// Real browser e2e for dice (R-Y130), as Telegram's apps draw them: a die
// is its animation from Telegram's set for its emoji — the sticker that
// rolls to its value, shown at rest on that value for an old throw —
// with no bubble around it; the slot machine stays a card; the set is
// asked once for the page. Telegram's answers faked in the page, a fake
// chat in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`;
// run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:dice

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '555';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 3_600_000 + n * 60_000);
const die = (n, emoticon, value) => ({
  id: `msg:telegram:${CHAT}:${n}`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: '',
  timestamp: at(n).toISOString(),
  raw: {
    id: n,
    date: Math.floor(at(n).getTime() / 1000),
    media: { className: 'MessageMediaDice', emoticon, value },
  },
});
await store.put(die(1, '🎲', 4));
await store.put(die(2, '🎲', 6));
await store.put(die(3, '🎰', 64));

// The smallest Lottie animation: ten empty frames.
const LOTTIE = JSON.stringify({
  v: '5.5.2',
  fr: 30,
  ip: 0,
  op: 10,
  w: 64,
  h: 64,
  layers: [],
});

const { base, page, until, finish } = await openChatApp('dice', { store });

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const asked = [];
await page.route('**/api/telegram/dice', (route) => {
  const { emoticon } = route.request().postDataJSON();
  asked.push(emoticon);
  return fulfil(route, {
    ok: true,
    emoticon,
    items: Array.from({ length: 7 }, (_, i) => ({
      id: String(900 + i),
      kind: 'sticker',
      format: 'tgs',
      emoji: emoticon,
    })),
  });
});
const files = [];
await page.route('**/api/telegram/sticker?*', (route) => {
  const url = new URL(route.request().url());
  files.push(`${url.searchParams.get('id')}:${url.searchParams.get('full')}`);
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: LOTTIE,
  });
});

const row = (n) => page.locator(`[data-message="msg:telegram:${CHAT}:${n}"]`);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await row(1).waitFor({ timeout: 15000 });

  // Each die draws the animation that rolls to its value.
  await until(
    async () => (await page.locator('.bubble-die [data-lottie]').count()) >= 2,
    'the dice drawn'
  );
  await until(
    () => files.includes('904:1') && files.includes('906:1'),
    `the value's animation: ${files}`
  );
  assert(asked.join() === '🎲', `the set asked once: ${asked}`);
  // No bubble around a die.
  assert(
    (await row(1).getAttribute('class')).includes('bare'),
    'a die is bare'
  );
  // The slot machine stays a card with its value.
  assert(
    (await row(3).locator('.bubble-die [data-lottie]').count()) === 0,
    'no animation for the slot machine'
  );
  assert(
    (await row(3).locator('.dice-value').textContent()) === '64',
    'the slot machine card'
  );
});
