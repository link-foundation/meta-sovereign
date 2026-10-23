// Real browser e2e for channel boosts (R-Y173), as Telegram Desktop has
// them: the info column of a channel shows the boost level with its
// progress and the boost link with Copy; "Boost" gives the channel a free
// slot at once, asks in the page before moving a slot that boosts another
// chat, and shows Telegram's "premium required" as text without Premium;
// admins open the list of boosters (paged). Applying is a write made only
// on the click. Telegram's answers faked in the page, a fake chat in a
// memory store, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:boosts

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1005';
const URL = 'https://t.me/fakechannel?boost';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHANNEL}:1`,
  source: 'telegram',
  chat: CHANNEL,
  chatName: 'Fake Channel',
  chatType: 'channel',
  body: 'hello',
  sender: '31',
  senderName: 'Someone',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

const { base, page, until, finish } = await openChatApp('boosts', { store });
await page.addInitScript(() => {
  globalThis.__copied = null;
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (words) => {
        globalThis.__copied = words;
      },
    },
  });
});

const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
  'chat-info*': { kind: 'channel', title: 'Fake Channel', canViewStats: true },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) =>
    fulfil(route, { chat: CHANNEL, ...answer })
  );
}

let boosts = 2;
let premium = false;
let slots = [];
const applies = [];
const later = Math.floor(Date.now() / 1000) + 1_000_000;
await page.route('**/api/telegram/boosts-status', (route) =>
  fulfil(route, {
    ok: true,
    level: 1,
    boosts,
    giftBoosts: 0,
    currentLevelBoosts: 1,
    nextLevelBoosts: 4,
    url: URL,
    mine: false,
  })
);
await page.route('**/api/telegram/my-boosts', (route) =>
  fulfil(route, { ok: true, premium, slots })
);
await page.route('**/api/telegram/boost-apply', (route) => {
  applies.push(route.request().postDataJSON());
  boosts += 1;
  return fulfil(route, { ok: true, slots });
});
const asks = [];
await page.route('**/api/telegram/boosters', (route) => {
  const body = route.request().postDataJSON();
  asks.push(body);
  const one = (name, user) => ({
    user,
    name,
    date: 10,
    expires: later,
    multiplier: 1,
    gift: false,
    giveaway: false,
  });
  return fulfil(
    route,
    body.offset
      ? { ok: true, count: 2, boosters: [one('Bob Second', '8')], next: null }
      : { ok: true, count: 2, boosters: [one('Ann First', '7')], next: 'o2' }
  );
});

const panel = page.locator('.person-panel [data-boosts]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const dialog = page.locator('[data-dialog="boosters"]');

const showSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await panel.waitFor({ timeout: 10000 });
  const level = await panel.locator('[data-boosts-level]').textContent();
  assert(level.includes('Level 1'), `level: ${level}`);
  assert(level.includes('2 of 4'), `progress: ${level}`);
  assert(
    (await panel
      .locator('[role="progressbar"]')
      .getAttribute('aria-valuenow')) === '33',
    'the bar at a third'
  );
  assert((await panel.textContent()).includes(URL), 'the boost link shows');
  await panel.locator('[data-action="boost-copy"]').click();
  await until(
    async () => (await page.evaluate(() => globalThis.__copied)) === URL,
    'Copy writes the link'
  );
};

const premiumSteps = async () => {
  await panel.locator('[data-action="boost"]').click();
  await panel.locator('[data-boost-error]').waitFor({ timeout: 5000 });
  assert(
    (await panel.locator('[data-boost-error]').textContent()).includes(
      'Premium'
    ),
    'premium required as text'
  );
  assert(applies.length === 0, 'nothing applied without Premium');
};

const askSteps = async () => {
  // A slot in use for another chat: the page asks first.
  premium = true;
  slots = [
    {
      slot: 1,
      chat: '-1009',
      title: 'Other Channel',
      expires: later,
      cooldownUntil: 0,
    },
  ];
  await panel.locator('[data-action="boost"]').click();
  await panel.locator('[data-boosts-ask]').waitFor({ timeout: 5000 });
  const ask = await panel.locator('[data-boosts-ask]').textContent();
  assert(ask.includes('Other Channel'), `the ask names the chat: ${ask}`);
  assert(applies.length === 0, 'asked, nothing applied yet');
  await panel.locator('[data-action="boost-cancel"]').click();
  await gone(panel.locator('[data-boosts-ask]'), 'Cancel closes the ask');
  assert(applies.length === 0, 'cancelled, nothing applied');
  await panel.locator('[data-action="boost"]').click();
  await panel.locator('[data-action="boost-confirm"]').click();
  await panel.locator('[data-boost-done]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(applies) === JSON.stringify([{ chat: CHANNEL, slot: 1 }]),
    `applied: ${JSON.stringify(applies)}`
  );
  await until(
    async () =>
      (await panel.locator('[data-boosts-level]').textContent()).includes(
        '3 of 4'
      ),
    'the progress refreshes'
  );
};

const freeSteps = async () => {
  slots = [
    { slot: 2, chat: null, title: '', expires: later, cooldownUntil: 0 },
  ];
  await panel.locator('[data-action="boost"]').click();
  await until(async () => applies.length === 2, 'a free slot applies at once');
  assert(applies[1].slot === 2, `the free slot: ${JSON.stringify(applies)}`);
  assert(
    (await panel.locator('[data-boosts-ask]').count()) === 0,
    'no question for a free slot'
  );
};

const boosterSteps = async () => {
  await panel.locator('[data-action="boosters-open"]').click();
  await dialog.locator('[data-booster="7"]').waitFor({ timeout: 5000 });
  assert((await dialog.textContent()).includes('Ann First'), 'first page');
  await dialog.locator('[data-action="boosters-more"]').click();
  await dialog.locator('[data-booster="8"]').waitFor({ timeout: 5000 });
  assert(asks[1].offset === 'o2', `paged: ${JSON.stringify(asks)}`);
  assert(
    (await dialog.locator('[data-action="boosters-more"]').count()) === 0,
    'no more after the last page'
  );
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes the list');
};

await finish(async () => {
  await showSteps();
  await premiumSteps();
  await askSteps();
  await freeSteps();
  await boosterSteps();
});
