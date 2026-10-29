// Real browser e2e for giveaways (R-Y184), as Telegram Desktop shows them:
// a giveaway post is a card with its prize (Telegram Premium months, or
// Stars, with the extra text), who takes part, from which countries and the
// day the winners are chosen; "Learn more" asks Telegram about that very
// message (payments.getGiveawayInfo) and says whether you take part, why you
// cannot, the winners and whether you won. A finished giveaway shows its
// results card and a line in the chat. All read only: nothing but reads is
// ever sent. Telegram's answers faked in the page, a fake chat in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:giveaways

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHANNEL = '-1005';
const store = createMemoryStore();
const put = (id, raw, extra = {}) =>
  store.put({
    id: `msg:telegram:${CHANNEL}:${id}`,
    source: 'telegram',
    chat: CHANNEL,
    chatName: 'Fake Channel',
    chatType: 'channel',
    sender: '5',
    senderName: 'Fake Channel',
    body: '📎',
    timestamp: new Date(Date.now() - (10 - id) * 60_000).toISOString(),
    raw: { id, ...raw },
    ...extra,
  });
await put(1, {
  media: {
    className: 'MessageMediaGiveaway',
    channels: [5, 6],
    quantity: 5,
    months: 3,
    prizeDescription: 'a mug',
    countriesIso2: ['DE'],
    untilDate: 1_800_000_000,
  },
});
await put(2, {
  media: {
    className: 'MessageMediaGiveaway',
    channels: [5],
    quantity: 10,
    stars: 500,
    onlyNewSubscribers: true,
    untilDate: 1_800_000_000,
  },
});
await put(3, {
  media: {
    className: 'MessageMediaGiveawayResults',
    channelId: 5,
    launchMsgId: 7,
    winnersCount: 2,
    unclaimedCount: 1,
    winners: [10, 11],
    months: 3,
    untilDate: 1_800_000_100,
  },
});
await put(
  4,
  { action: { winnersCount: 2, unclaimedCount: 1 } },
  { body: '', service: 'MessageActionGiveawayResults' }
);

const { base, page, finish } = await openChatApp('giveaways', { store });

const posts = [];
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().includes('/api/')) {
    posts.push(new URL(request.url()).pathname);
  }
});
const infoAsked = [];
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: CHANNEL, kind: 'channel', title: 'Fake Channel' })
);
await page.route('**/api/telegram/giveaway-info', (route) => {
  const body = route.request().postDataJSON();
  infoAsked.push(body);
  if (body.id === 7) {
    return fulfil(route, {
      ok: true,
      ended: true,
      winner: true,
      refunded: false,
      startDate: 1_790_000_000,
      finishDate: 1_800_000_100,
      winnersCount: 2,
      activatedCount: 1,
      slug: 'abc123',
      channelNames: [{ id: '5', name: 'Fake Channel' }],
      winnerNames: [{ id: '10', name: 'Ann Lee' }],
    });
  }
  return fulfil(route, {
    ok: true,
    ended: false,
    participating: false,
    preparing: false,
    startDate: 1_790_000_000,
    joinedTooEarlyDate: 1_780_000_000,
    channelNames: [
      { id: '5', name: 'Fake Channel' },
      { id: '6', name: 'Other Channel' },
    ],
    winnerNames: [],
  });
});

const card = (id, kind) =>
  page.locator(
    `[data-row="msg:telegram:${CHANNEL}:${id}"] [data-giveaway="${kind}"]`
  );
const details = page.locator('[data-dialog="giveaway"]');

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();

  // A running giveaway with Premium months, an extra prize and countries.
  const first = card(1, 'running');
  await first.waitFor({ timeout: 15_000 });
  const text = await first.textContent();
  for (const part of [
    'Giveaway',
    '5 Telegram Premium subscriptions for 3 months',
    'with a mug',
    'All subscribers of these 2 channels',
    'Germany',
    '2027',
  ]) {
    assert(text.includes(part), `card 1 says "${part}": ${text}`);
  }
  assert(infoAsked.length === 0, 'Telegram is not asked until Learn more');

  // Stars for each winner, only new subscribers.
  const stars = await card(2, 'running').textContent();
  assert(stars.includes('500 ⭐ Stars for each winner'), `stars: ${stars}`);
  assert(
    stars.includes('Only those who subscribe to this channel after the start'),
    `audience: ${stars}`
  );

  // Learn more: asks about that message and says why you cannot take part.
  await first.locator('[data-action="giveaway-more"]').click();
  await details.waitFor({ timeout: 5000 });
  await details.getByText('You cannot take part').waitFor({ timeout: 5000 });
  assert(infoAsked.length === 1, 'asked once');
  assert(
    infoAsked[0].chat === CHANNEL &&
      infoAsked[0].id === 1 &&
      infoAsked[0].channels.join() === '5,6',
    JSON.stringify(infoAsked[0])
  );
  assert(
    (await details.textContent()).includes('before the giveaway began'),
    'the reason is in words'
  );
  await details.locator('[data-action="close"]').click();
  await details.waitFor({ state: 'detached' });

  // The results: the winners, the prizes not claimed, and whether you won.
  const results = card(3, 'results');
  await results.waitFor({ timeout: 5000 });
  const ended = await results.textContent();
  assert(ended.includes('2 winners were chosen'), `results: ${ended}`);
  assert(ended.includes('1 prize was not claimed'), `unclaimed: ${ended}`);
  await results.locator('[data-action="giveaway-more"]').click();
  await details
    .getByText('Congratulations, you won!')
    .waitFor({ timeout: 5000 });
  const last = infoAsked.at(-1);
  assert(
    last.chat === '-1005' && last.id === 7 && last.winners.join() === '10,11',
    JSON.stringify(last)
  );
  const won = await details.textContent();
  assert(won.includes('Ann Lee'), `winner names: ${won}`);
  assert(
    won.split(/\s+/).some((word) => word === 'https://t.me/giftcode/abc123'),
    `prize link: ${won}`
  );
  assert(won.includes('1 of 2 prizes claimed'), `claimed: ${won}`);
  await details.locator('[data-action="close"]').click();
  await details.waitFor({ state: 'detached' });

  // The line in the chat.
  const line = await page
    .locator(`[data-message="msg:telegram:${CHANNEL}:4"]`)
    .textContent();
  assert(
    line.includes('Giveaway ended: 2 winners, 1 not claimed'),
    `service line: ${line}`
  );

  // Read only: nothing that writes was asked of Telegram, the giveaway
  // questions are the only requests about giveaways.
  const WRITE =
    /^\/api\/(send|telegram\/(send|forward|paid|join|save|delete|toggle|claim|react|edit)[a-z-]*|telegram\/[a-z-]+-(set|save))$/;
  const writes = posts.filter((p) => WRITE.test(p));
  assert(writes.length === 0, `writes: ${writes.join()}`);
  assert(
    posts.filter((p) => /giveaway/.test(p)).length === infoAsked.length,
    'only giveaway-info'
  );
});
