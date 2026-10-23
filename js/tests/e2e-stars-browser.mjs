// Real browser e2e for Telegram Stars (R-Y176), as Telegram Desktop shows
// them: Settings → Telegram Stars (the balance and the history, paged,
// with All, Incoming and Outgoing tabs and a refunded row); a person's
// gifts in the info column (a grid, a detail card, hiding a gift from the
// profile as the only write); the paid ⭐ reaction of a channel post (a
// dialog with the amount, the balance and Send, the only thing that
// sends); paid media (blurred previews, a question with the price and the
// balance, the real photos once unlocked). Telegram's answers faked in the
// page, fake chats in a memory store, a server on a free port, a headless
// browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:stars

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const PERSON = '5';
const CHANNEL = '-1005';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const STRIPPED = Buffer.from([1, 20, 20, 1, 2, 3, 4]).toString('base64');
const photo = (id) => ({
  className: 'MessageMediaPhoto',
  photo: {
    id,
    dcId: 2,
    sizes: [{ className: 'PhotoSize', type: 'm', w: 100, h: 100, size: 99 }],
  },
});
const preview = () => ({
  className: 'MessageExtendedMediaPreview',
  w: 100,
  h: 100,
  thumb: {
    className: 'PhotoStrippedSize',
    type: 'i',
    bytes: { bytes: STRIPPED },
  },
});
const unlocked = (id) => ({
  className: 'MessageExtendedMedia',
  media: photo(id),
});

const NOW = Date.now();
const store = createMemoryStore();
const put = (chat, id, name, type, extra) =>
  store.put({
    id: `msg:telegram:${chat}:${id}`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: extra.body ?? `post ${id}`,
    timestamp: new Date(NOW - (10 - id) * 60_000).toISOString(),
    raw: { id, ...extra.raw },
  });
await put(PERSON, 1, 'Some Friend', 'private', { raw: {} });
await put(CHANNEL, 1, 'Fake Channel', 'channel', {
  raw: {
    reactions: {
      results: [{ reaction: { className: 'ReactionPaid' }, count: 7 }],
      topReactors: [
        { my: true, count: 3 },
        { anonymous: true, count: 4 },
      ],
    },
  },
});
await put(CHANNEL, 2, 'Fake Channel', 'channel', {
  raw: {
    media: {
      className: 'MessageMediaPaidMedia',
      starsAmount: 50,
      extendedMedia: [preview(), preview()],
    },
  },
});
await put(CHANNEL, 3, 'Fake Channel', 'channel', {
  raw: {
    media: {
      className: 'MessageMediaPaidMedia',
      starsAmount: 50,
      extendedMedia: [unlocked('11'), unlocked('12')],
    },
  },
});
await put(CHANNEL, 4, 'Fake Channel', 'channel', {
  raw: {
    media: {
      className: 'MessageMediaPaidMedia',
      starsAmount: 50,
      extendedMedia: [unlocked('13')],
    },
  },
});

const { base, page, until, finish } = await openChatApp('stars', { store });
await page.setViewportSize({ width: 1200, height: 1600 });

const fixed = {
  history: { written: 0, cached: 0, complete: true },
  'shared-counts': { ok: true, counts: {} },
};
for (const [name, answer] of Object.entries(fixed)) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, answer));
}
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, {
    chat,
    kind: chat === CHANNEL ? 'channel' : 'user',
    title: chat === CHANNEL ? 'Fake Channel' : 'Some Friend',
  });
});
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  })
);
const pictures = [];
await page.route('**/api/telegram/sticker*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/media*', (route) => {
  pictures.push(new URL(route.request().url()).searchParams);
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});

let balance = 120;
await page.route('**/api/telegram/stars-status', (route) =>
  fulfil(route, { ok: true, balance })
);
const row = (id, amount, extra = {}) => ({
  id,
  amount,
  date: 1_700_000_000,
  title: '',
  description: '',
  kind: '',
  source: { kind: 'peer', name: 'Ann Lee' },
  refund: false,
  pending: false,
  failed: false,
  ...extra,
});
const histories = [];
await page.route('**/api/telegram/stars-history', (route) => {
  const body = route.request().postDataJSON();
  histories.push(body);
  const transactions = (() => {
    if (body.filter === 'in') {
      return [row('in1', 100, { source: { kind: 'fragment', name: '' } })];
    }
    if (body.filter === 'out') {
      return [row('out1', -30, { kind: 'reaction' })];
    }
    return body.offset
      ? [row('a3', -5, { kind: 'media' })]
      : [
          row('a1', 100, { source: { kind: 'appstore', name: '' } }),
          row('a2', -50, { kind: 'gift', refund: true }),
        ];
  })();
  return fulfil(route, {
    ok: true,
    balance,
    transactions,
    next: !body.offset && (body.filter ?? 'all') === 'all' ? 'o2' : null,
  });
});

const gift = (msgId, fromName, extra = {}) => ({
  msgId,
  savedId: '',
  from: fromName ? '8' : null,
  fromName,
  anonymous: !fromName,
  date: 1_700_000_000,
  stars: 25,
  title: '',
  text: '',
  hidden: false,
  sticker: { id: String(900 + msgId), kind: 'sticker', format: 'webp' },
  ...extra,
});
const giftAsks = [];
const saves = [];
await page.route('**/api/telegram/star-gifts', (route) => {
  const body = route.request().postDataJSON();
  giftAsks.push(body);
  return fulfil(
    route,
    body.offset
      ? {
          ok: true,
          count: 3,
          mine: true,
          gifts: [gift(0, '', { savedId: '77', stars: 99 })],
          next: null,
        }
      : {
          ok: true,
          count: 3,
          mine: true,
          gifts: [
            gift(11, 'Bob Ray', { text: 'Happy birthday' }),
            gift(12, ''),
          ],
          next: 'g2',
        }
  );
});
await page.route('**/api/telegram/star-gift-save', (route) => {
  saves.push(route.request().postDataJSON());
  return fulfil(route, { ok: true, hidden: saves.at(-1).unsave });
});

const reacts = [];
let reactAnswer = { ok: false, error: 'BALANCE_TOO_LOW', code: 'balance' };
await page.route('**/api/telegram/paid-reaction', (route) => {
  reacts.push(route.request().postDataJSON());
  return fulfil(route, reactAnswer);
});
const unlocks = [];
let unlockAnswer = { ok: false, error: 'price changed', code: 'price' };
await page.route('**/api/telegram/paid-media-unlock', (route) => {
  unlocks.push(route.request().postDataJSON());
  return fulfil(route, unlockAnswer);
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const card = page.locator('[data-dialog="my-profile"]');
const stars = page.locator('[data-dialog="stars"]');

const starsSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${PERSON}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await card.locator('[data-action="open-stars"]').click();
  await stars.locator('[data-stars-row="a2"]').waitFor({ timeout: 5000 });
  const balanceText = await stars.locator('[data-stars-balance]').textContent();
  assert(balanceText.includes('120'), `balance: ${balanceText}`);
  assert(
    (await stars.textContent()).includes('official'),
    'a note that Stars are bought in the official apps'
  );
  const first = await stars.locator('[data-stars-row="a1"]').textContent();
  assert(
    first.includes('App Store') && first.includes('+100'),
    `source and sign: ${first}`
  );
  const second = await stars.locator('[data-stars-row="a2"]').textContent();
  assert(
    second.includes('Gift') &&
      second.includes('50') &&
      second.includes('Refunded'),
    `a refunded gift: ${second}`
  );
  assert(
    (await stars.locator('[data-stars-amount="-50"]').textContent()).includes(
      '−'
    ),
    'a true minus for outgoing'
  );
  // Paging.
  await stars.locator('[data-action="stars-more"]').click();
  await stars.locator('[data-stars-row="a3"]').waitFor({ timeout: 5000 });
  assert(
    histories.at(-1).offset === 'o2',
    `paged: ${JSON.stringify(histories)}`
  );
  assert(
    (await stars.locator('[data-action="stars-more"]').count()) === 0,
    'no more after the last page'
  );
  // Tabs.
  await stars.locator('[data-stars-tab="in"]').click();
  await stars.locator('[data-stars-row="in1"]').waitFor({ timeout: 5000 });
  assert(histories.at(-1).filter === 'in', 'the Incoming tab asks inbound');
  assert(
    (await stars.locator('[data-stars-row]').count()) === 1,
    'only incoming'
  );
  assert(
    (await stars.locator('[data-stars-row="in1"]').textContent()).includes(
      'Fragment'
    ),
    'Fragment as the source'
  );
  await stars.locator('[data-stars-tab="out"]').click();
  await stars.locator('[data-stars-row="out1"]').waitFor({ timeout: 5000 });
  assert(histories.at(-1).filter === 'out', 'the Outgoing tab asks outbound');
  await stars.locator('[data-stars-tab="all"]').click();
  await stars.locator('[data-stars-row="a1"]').waitFor({ timeout: 5000 });
  // Escape closes only the Stars dialog, the card stays.
  await page.keyboard.press('Escape');
  await gone(stars, 'Escape closes Telegram Stars');
  assert((await card.count()) === 1, 'the profile card stays');
  await page.keyboard.press('Escape');
  await gone(card, 'Escape closes the card');
};

const giftSteps = async () => {
  await page.locator(`[data-chat="telegram:${PERSON}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  const grid = page.locator('.person-panel [data-gifts]');
  await grid.waitFor({ timeout: 10000 });
  await grid.locator('[data-gift="11"]').waitFor();
  const first = await grid.locator('[data-gift="11"]').textContent();
  assert(
    first.includes('25 ⭐') && first.includes('Bob Ray'),
    `a gift: ${first}`
  );
  assert(
    (await grid.locator('[data-gift="12"]').textContent()).includes(
      'Anonymous'
    ),
    'an anonymous sender is not named'
  );
  await until(
    async () => (await grid.locator('[data-gift="11"] img').count()) === 1,
    'the gift shows its sticker'
  );
  await grid.locator('[data-action="gifts-more"]').click();
  await grid.locator('[data-gift="77"]').waitFor({ timeout: 5000 });
  assert(giftAsks.at(-1).offset === 'g2', `paged: ${JSON.stringify(giftAsks)}`);
  // A gift opens its card; hiding it is the only write.
  const detail = page.locator('[data-dialog="gift"]');
  await grid.locator('[data-gift="11"]').click();
  await detail.waitFor();
  assert(
    (await detail.textContent()).includes('Happy birthday'),
    'the gift text'
  );
  assert(saves.length === 0, 'opening a gift writes nothing');
  // Hiding asks first (R-Y193): nothing is written until the confirmation.
  await detail.locator('[data-action="gift-toggle"]').click();
  await detail.locator('[data-gift-ask="toggle"]').waitFor();
  assert(saves.length === 0, 'asking to hide writes nothing');
  await detail.locator('[data-action="gift-confirm"]').click();
  await detail.locator('[data-gift-hidden]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(saves) ===
      JSON.stringify([{ chat: PERSON, msgId: 11, unsave: true }]),
    `hidden: ${JSON.stringify(saves)}`
  );
  await detail.locator('[data-action="gift-toggle"]').click();
  await detail.locator('[data-action="gift-confirm"]').click();
  await until(async () => saves.length === 2, 'show asks again');
  assert(saves[1].unsave === false, 'shown again');
  await page.keyboard.press('Escape');
  await gone(detail, 'Escape closes the gift');
};

const reactionSteps = async () => {
  await page.locator(`[data-chat="telegram:${CHANNEL}"]`).click();
  const chip = page.locator('[data-paid-reaction="7"]');
  await chip.waitFor({ timeout: 10000 });
  assert(
    (await chip.textContent()).includes('7'),
    'the ⭐ chip with its count'
  );
  const dialog = page.locator('[data-dialog="paid-reaction"]');
  // Not enough Stars: Send is off.
  balance = 10;
  await chip.click();
  await dialog.locator('[data-field="paid-count"]').fill('25');
  await until(
    async () =>
      (await dialog.locator('[data-stars-balance="10"]').count()) === 1,
    'the balance shows'
  );
  assert(
    await dialog.locator('[data-action="submit"]').isDisabled(),
    'Send is off without the Stars'
  );
  assert(reacts.length === 0, 'nothing sent yet');
  await page.keyboard.press('Escape');
  await gone(dialog, 'Escape closes the dialog');
  // Enough Stars; a refusal shows as text.
  balance = 500;
  await chip.click();
  await dialog.locator('[data-stars-balance="500"]').waitFor({ timeout: 5000 });
  await dialog.locator('[data-field="paid-count"]').fill('25');
  const label = await dialog.locator('[data-action="submit"]').textContent();
  assert(label.includes('Send 25'), `the button: ${label}`);
  assert((await dialog.textContent()).includes('You: 3'), 'my top sender line');
  await dialog.locator('[data-field="paid-range"]').fill('30');
  assert(
    (await dialog.locator('[data-field="paid-count"]').inputValue()) === '30',
    'the slider moves the number'
  );
  await dialog.locator('[data-field="paid-count"]').fill('25');
  assert(reacts.length === 0, 'the slider and the number send nothing');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[role="alert"]').textContent()).includes(
      'Not enough'
    ),
    'BALANCE_TOO_LOW as text'
  );
  reactAnswer = { ok: true, sent: 25 };
  await dialog.locator('[data-action="submit"]').click();
  await gone(dialog, 'the dialog closes after a send');
  assert(
    JSON.stringify(reacts) ===
      JSON.stringify([
        { chat: CHANNEL, id: 1, count: 25 },
        { chat: CHANNEL, id: 1, count: 25 },
      ]),
    `sent: ${JSON.stringify(reacts)}`
  );
};

const mediaSteps = async () => {
  const locked = page.locator('[data-paid-media="locked"]');
  await locked.waitFor({ timeout: 10000 });
  assert(
    (await locked.locator('[data-paid-preview]').count()) === 2,
    'two previews'
  );
  const button = locked.locator('[data-action="paid-unlock"]');
  assert((await button.textContent()).includes('Unlock for 50'), 'the price');
  balance = 120;
  const ask = page.locator('[data-dialog="paid-unlock"]');
  await button.click();
  await ask.locator('[data-paid-price="50"]').waitFor({ timeout: 5000 });
  await ask.locator('[data-stars-balance="120"]').waitFor({ timeout: 5000 });
  await ask.locator('[data-action="cancel"]').click();
  await gone(ask, 'Cancel closes the question');
  assert(unlocks.length === 0, 'nothing paid before the confirmation');
  // A changed price is shown as text; then the payment goes through.
  await button.click();
  await ask.locator('[data-action="submit"]').click();
  await ask.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await ask.locator('[role="alert"]').textContent()).includes(
      'price changed'
    ),
    'a failure as text'
  );
  unlockAnswer = { ok: true, paid: 50 };
  await ask.locator('[data-action="submit"]').click();
  await gone(ask, 'the question closes after paying');
  await locked.locator('[data-paid-done]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(unlocks) ===
      JSON.stringify([
        { chat: CHANNEL, id: 2, stars: 50 },
        { chat: CHANNEL, id: 2, stars: 50 },
      ]),
    `paid: ${JSON.stringify(unlocks)}`
  );
  // Unlocked media shows through the media code.
  const open = page.locator('[data-paid-media="open"]');
  await open.locator('[data-paid-item]').nth(1).scrollIntoViewIfNeeded();
  await until(
    async () =>
      pictures.some((p) => p.get('id') === '3' && p.get('part') === '1'),
    'the second item is a part of the message'
  );
  assert(
    pictures.some((p) => p.get('id') === '3' && !p.get('part')),
    'the first item is the message itself'
  );
  await until(
    async () => pictures.some((p) => p.get('id') === '4' && !p.get('part')),
    'a single unlocked photo shows as a photo'
  );
};

await finish(async () => {
  await starsSteps();
  await giftSteps();
  await reactionSteps();
  await mediaSteps();
});
