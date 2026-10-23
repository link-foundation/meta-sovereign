// Real browser e2e for managing received gifts, unique gifts and gift codes
// (R-Y193), as Telegram Desktop has them: a profile's gifts as a grid; on
// the user's own profile a click opens a gift dialog whose "Hide from my
// profile" and "Convert to N ⭐" each wait for their confirmation, whose
// "Upgrade" shows what the gift may become and the price (a refused price
// shows as words), whose "Transfer" picks a contact and confirms, and whose
// "Pin to top" confirms; another person's gifts open read-only. A
// t.me/nft/<slug> link in a chat opens the unique gift's viewer; a
// t.me/giftcode/<slug> link and a gift code message open the gift code's
// dialog, where only the confirmation's button applies the code. Telegram's
// answers faked in the page, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:gifts-manage

import { assert, fulfil } from './helpers/e2e-chat.mjs';
import {
  PERSON,
  SELF,
  openAbout,
  openProfileApp,
} from './helpers/e2e-profile-chat.mjs';

const app = await openProfileApp('gifts-manage', {
  more: [
    { n: 2, body: 'Look https://t.me/nft/Plush-7 now' },
    { n: 3, body: 'Code https://t.me/giftcode/abc123 here' },
    { n: 4, body: 'Old https://t.me/giftcode/used1 one' },
    {
      n: 5,
      service: 'MessageActionGiftCode',
      raw: { action: { className: 'MessageActionGiftCode', slug: 'gc1' } },
    },
  ],
});
const { page, until, finish } = app;

const gift = (msgId, extra = {}) => ({
  msgId,
  savedId: '',
  from: '8',
  fromName: 'Bob Ray',
  anonymous: false,
  date: 1_700_000_000,
  stars: 50,
  title: `Gift ${msgId}`,
  text: '',
  hidden: false,
  giftId: String(msgId * 10),
  unique: null,
  canUpgrade: false,
  prepaid: false,
  upgradeStars: 0,
  convertStars: 0,
  transferStars: 0,
  canTransferAt: 0,
  pinned: false,
  sticker: { id: String(900 + msgId), kind: 'sticker', format: 'webp' },
  ...extra,
});
const mine = () => [
  gift(21, {
    text: 'Happy birthday',
    canUpgrade: true,
    upgradeStars: 25,
    convertStars: 40,
  }),
  gift(22, { convertStars: 30, pinned: true }),
  gift(23, {
    unique: { slug: 'Plush-7', num: 7, title: 'Plush' },
    transferStars: 10,
  }),
];
const removed = new Set();
const listAsks = [];
await page.route('**/api/telegram/star-gifts', (route) => {
  const body = route.request().postDataJSON();
  listAsks.push(body);
  const own = body.chat === SELF;
  return fulfil(route, {
    ok: true,
    count: 3,
    mine: own,
    next: null,
    gifts: own
      ? mine().filter((g) => !removed.has(g.msgId))
      : [gift(31, { unique: { slug: 'Plush-7', num: 7, title: 'Plush' } })],
  });
});

const calls = {
  save: [],
  convert: [],
  'upgrade-preview': [],
  upgrade: [],
  transfer: [],
  pin: [],
  apply: [],
  unique: [],
  check: [],
};
const record = (route, name, answer) =>
  page.route(`**/api/telegram/${route}`, (r) => {
    const body = r.request().postDataJSON();
    calls[name].push(body);
    return fulfil(r, typeof answer === 'function' ? answer(body) : answer);
  });
await record('star-gift-save', 'save', (b) => ({ ok: true, hidden: b.unsave }));
await record('gift-convert', 'convert', (b) => {
  removed.add(b.msgId);
  return { ok: true };
});
await record('gift-upgrade-preview', 'upgrade-preview', {
  ok: true,
  models: [{ name: 'Golden', permille: 15, sticker: null }],
  patterns: [{ name: 'Starfall', rarity: 'rare', sticker: null }],
  backdrops: [
    { name: 'Ocean', rarity: 'epic', center: '#112233', edge: '#445566' },
  ],
  prices: [{ date: 1, stars: 25 }],
});
let upgradeAnswer = { ok: false, error: 'price changed', code: 'price' };
await record('gift-upgrade', 'upgrade', () => upgradeAnswer);
await record('gift-transfer', 'transfer', (b) => {
  removed.add(b.msgId);
  return { ok: true, paid: b.stars };
});
await record('gift-pin', 'pin', (b) => ({ ok: true, pinned: b.pins.length }));
await page.route('**/api/telegram/chat-contacts', (route) =>
  fulfil(route, {
    ok: true,
    contacts: [
      { id: '8', name: 'Bob Ray', online: false },
      { id: '9', name: 'Cara Ng', online: false },
    ],
  })
);
const uniqueGift = {
  slug: 'Plush-7',
  title: 'Plush',
  num: 7,
  issued: 7,
  total: 100,
  owner: { id: '8', name: 'Ann Lee' },
  model: { name: 'Gold', permille: 5, sticker: { id: '910', kind: 'sticker' } },
  pattern: { name: 'Stars', rarity: 'epic', sticker: null },
  backdrop: {
    name: 'Ocean',
    rarity: 'uncommon',
    center: '#112233',
    edge: '#445566',
    pattern: '#778899',
    text: '#ffffff',
  },
};
await record('gift-unique', 'unique', { ok: true, gift: uniqueGift });
await record('gift-code-check', 'check', (b) => ({
  ok: true,
  info: {
    slug: b.slug,
    days: 90,
    months: 3,
    from: { id: '9', name: 'Chan' },
    viaGiveaway: false,
    date: 1_700_000_000,
    used: b.slug === 'used1',
    usedDate: b.slug === 'used1' ? 1_700_100_000 : null,
    to: null,
  },
}));
await record('gift-code-apply', 'apply', { ok: true });

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const dialog = page.locator('[data-dialog="gift"]');
const asked = (name) => dialog.locator(`[data-gift-ask="${name}"]`);
const cell = (id) => page.locator(`.person-panel [data-gift="${id}"]`);
const close = async (locator, what) => {
  await page.keyboard.press('Escape');
  await gone(locator, what);
};

const gridSteps = async () => {
  await openAbout(app, SELF);
  const grid = page.locator('.person-panel [data-gifts]');
  await grid.waitFor({ timeout: 10_000 });
  for (const id of [21, 22, 23]) {
    await cell(id).waitFor();
  }
  assert(
    (await cell(22).textContent()).includes('📌'),
    'a pinned gift is marked'
  );
  assert(
    (await cell(23).textContent()).includes('#7'),
    "a unique gift's number"
  );
};

const hideSteps = async () => {
  await cell(21).click();
  await dialog.waitFor();
  const text = await dialog.textContent();
  assert(
    text.includes('Bob Ray') && text.includes('Happy birthday'),
    `who and what: ${text}`
  );
  assert(text.includes('Worth 50'), 'the value');
  assert(
    (await dialog.locator('[data-action="gift-toggle"]').textContent()) ===
      'Hide from my profile',
    'hide wording'
  );
  assert(
    (await dialog.locator('[data-action="gift-convert"]').textContent()) ===
      'Convert to 40 ⭐',
    'convert wording'
  );
  assert(
    (await dialog.locator('[data-action="gift-transfer"]').count()) === 0,
    'only a unique gift is transferred'
  );
  assert(calls.save.length === 0, 'opening writes nothing');
  await dialog.locator('[data-action="gift-toggle"]').click();
  await asked('toggle').waitFor();
  assert(calls.save.length === 0, 'asking to hide writes nothing');
  await dialog.locator('[data-action="gift-cancel"]').click();
  await gone(asked('toggle'), 'cancel closes the question');
  assert(calls.save.length === 0, 'cancelling writes nothing');
  await dialog.locator('[data-action="gift-toggle"]').click();
  await dialog.locator('[data-action="gift-confirm"]').click();
  await dialog.locator('[data-gift-hidden]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(calls.save) ===
      JSON.stringify([{ chat: SELF, msgId: 21, unsave: true }]),
    `hidden: ${JSON.stringify(calls.save)}`
  );
  assert(
    (await dialog.locator('[data-action="gift-toggle"]').textContent()) ===
      'Show on my profile',
    'show wording'
  );
};

const upgradeSteps = async () => {
  await dialog.locator('[data-action="gift-upgrade"]').click();
  const preview = dialog.locator('[data-gift-preview]');
  await preview.waitFor({ timeout: 5000 });
  const text = await preview.textContent();
  assert(
    text.includes('Golden') &&
      text.includes('1.5%') &&
      text.includes('Starfall') &&
      text.includes('rare') &&
      text.includes('Ocean'),
    `the preview: ${text}`
  );
  const yes = dialog.locator('[data-action="gift-confirm"]');
  assert((await yes.textContent()) === 'Upgrade for 25 ⭐', 'the price');
  assert(calls.upgrade.length === 0, 'the preview upgrades nothing');
  await dialog.locator('[data-action="gift-cancel"]').click();
  assert(calls.upgrade.length === 0, 'cancelling upgrades nothing');
  // A price that changed is refused by the server: words, nothing done.
  await dialog.locator('[data-action="gift-upgrade"]').click();
  await dialog.locator('[data-action="gift-confirm"]').click();
  await dialog.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[role="alert"]').textContent()).includes(
      'price changed'
    ),
    'a refused price shows as words'
  );
  assert(calls.upgrade.length === 1, 'one try');
  assert(
    JSON.stringify(calls.upgrade[0]) ===
      JSON.stringify({ chat: SELF, msgId: 21, stars: 25 }),
    `the price sent: ${JSON.stringify(calls.upgrade[0])}`
  );
  upgradeAnswer = { ok: true, paid: 25 };
  await dialog.locator('[data-action="gift-upgrade"]').click();
  await dialog.locator('[data-action="gift-confirm"]').click();
  await gone(dialog, 'an upgraded gift closes its dialog');
  assert(calls.upgrade.length === 2, 'upgraded');
  await until(async () => listAsks.length >= 2, 'the list is asked again');
};

const uniqueSteps = async () => {
  await cell(23).click();
  await dialog.waitFor();
  assert(
    (await dialog.locator('[data-action="gift-upgrade"]').count()) === 0 &&
      (await dialog.locator('[data-action="gift-convert"]').count()) === 0,
    'a unique gift is neither upgraded nor converted'
  );
  // Pin to top asks first and sends the whole pinned list.
  await dialog.locator('[data-action="gift-pin"]').click();
  await asked('pin').waitFor();
  assert(calls.pin.length === 0, 'asking to pin writes nothing');
  await dialog.locator('[data-action="gift-confirm"]').click();
  await dialog.locator('[data-gift-pinned]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(calls.pin) ===
      JSON.stringify([{ chat: SELF, pins: [{ msgId: 23 }, { msgId: 22 }] }]),
    `pinned: ${JSON.stringify(calls.pin)}`
  );
  // View opens the unique gift's viewer over the dialog.
  await dialog.locator('[data-action="gift-view"]').click();
  const viewer = page.locator('[data-dialog="unique-gift"]');
  await viewer.waitFor({ timeout: 5000 });
  assert(calls.unique.at(-1).slug === 'Plush-7', 'asked by its slug');
  // (Escape closes every dialog stacked, so the viewer's own button.)
  await viewer.locator('[data-action="close"]').click();
  await gone(viewer, 'the viewer closes');
  // Transfer: pick a contact, then confirm; it costs 10 Stars.
  await dialog.locator('[data-action="gift-transfer"]').click();
  await dialog.locator('[data-gift-contact="9"]').waitFor({ timeout: 5000 });
  assert(calls.transfer.length === 0, 'picking transfers nothing');
  await dialog.locator('[data-gift-contact="9"]').click();
  const ask = asked('transfer');
  await ask.waitFor();
  const question = await ask.textContent();
  assert(
    question.includes('Cara Ng') && question.includes('10 ⭐'),
    `the question: ${question}`
  );
  assert(calls.transfer.length === 0, 'asking transfers nothing');
  await dialog.locator('[data-action="gift-confirm"]').click();
  await gone(dialog, 'a transferred gift closes its dialog');
  assert(
    JSON.stringify(calls.transfer) ===
      JSON.stringify([{ chat: SELF, msgId: 23, to: '9', stars: 10 }]),
    `transferred: ${JSON.stringify(calls.transfer)}`
  );
};

const convertSteps = async () => {
  await cell(22).click();
  await dialog.waitFor();
  await dialog.locator('[data-action="gift-convert"]').click();
  const ask = asked('convert');
  await ask.waitFor();
  assert(
    (await ask.textContent()).includes(
      "Convert this gift to 30 Stars? This can't be undone."
    ),
    'the question'
  );
  assert(calls.convert.length === 0, 'asking converts nothing');
  await dialog.locator('[data-action="gift-confirm"]').click();
  await gone(dialog, 'a converted gift closes its dialog');
  assert(
    JSON.stringify(calls.convert) ===
      JSON.stringify([{ chat: SELF, msgId: 22 }]),
    `converted: ${JSON.stringify(calls.convert)}`
  );
  await gone(cell(22), 'the gift leaves the grid');
};

const othersSteps = async () => {
  await openAbout(app, PERSON);
  await cell(31).waitFor({ timeout: 10_000 });
  await cell(31).click();
  await dialog.waitFor();
  for (const name of [
    'gift-toggle',
    'gift-convert',
    'gift-upgrade',
    'gift-transfer',
    'gift-pin',
  ]) {
    assert(
      (await dialog.locator(`[data-action="${name}"]`).count()) === 0,
      `others' gifts are read only: ${name}`
    );
  }
  assert(
    (await dialog.locator('[data-action="gift-view"]').count()) === 1,
    'a unique gift can be viewed'
  );
  await close(dialog, 'Escape closes the gift');
};

const linkSteps = async () => {
  await page
    .locator('[data-action="chat-about"]')
    .click()
    .catch(() => {});
  const popups = [];
  page.context().on('page', (p) => popups.push(p));
  await page.locator(`[data-chat="telegram:${PERSON}"]`).click();
  const nft = page.locator('a.msg-link[href="https://t.me/nft/Plush-7"]');
  await nft.waitFor({ timeout: 10_000 });
  await nft.click();
  const viewer = page.locator('[data-dialog="unique-gift"]');
  await viewer.locator('[data-unique-hero]').waitFor({ timeout: 5000 });
  const text = await viewer.textContent();
  for (const word of [
    'Plush',
    '#7',
    'Gold',
    '0.5%',
    'Ocean',
    'Stars',
    'Ann Lee',
  ]) {
    assert(text.includes(word), `the viewer shows ${word}: ${text}`);
  }
  assert(text.includes('7 of 100'), `issued of total: ${text}`);
  assert(
    (await viewer.locator('[data-unique-hero]').getAttribute('style')) !== null,
    'the backdrop'
  );
  await close(viewer, 'Escape closes the viewer');
  assert(popups.length === 0, 'the link opened in the app, not the browser');
};

const codeSteps = async () => {
  const box = page.locator('[data-dialog="gift-code"]');
  await page.locator('a.msg-link[href="https://t.me/giftcode/abc123"]').click();
  await box.locator('[data-gift-code]').waitFor({ timeout: 5000 });
  const text = await box.textContent();
  assert(
    text.includes('3 months of Telegram Premium') && text.includes('From Chan'),
    `the code: ${text}`
  );
  assert(calls.check.at(-1).slug === 'abc123', 'checked by its slug');
  assert(calls.apply.length === 0, 'looking applies nothing');
  await box.locator('[data-action="gift-code-apply"]').click();
  const ask = box.locator('[data-gift-ask="code-apply"]');
  await ask.waitFor();
  assert(
    (await ask.textContent()).includes(
      'Activate Telegram Premium for 3 months?'
    ),
    'the question'
  );
  assert(calls.apply.length === 0, 'asking applies nothing');
  await box.locator('[data-action="gift-cancel"]').click();
  assert(calls.apply.length === 0, 'cancelling applies nothing');
  await box.locator('[data-action="gift-code-apply"]').click();
  await box.locator('[data-action="gift-confirm"]').click();
  await box.locator('[data-code-applied]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(calls.apply) === JSON.stringify([{ slug: 'abc123' }]),
    `applied: ${JSON.stringify(calls.apply)}`
  );
  await close(box, 'Escape closes the code');
  // A code already used says so and cannot be applied.
  await page.locator('a.msg-link[href="https://t.me/giftcode/used1"]').click();
  await box.locator('[data-code-used]').waitFor({ timeout: 5000 });
  assert(
    (await box.locator('[data-action="gift-code-apply"]').count()) === 0,
    'a used code has no Apply'
  );
  await close(box, 'Escape closes the used code');
  // A gift code message opens the same dialog.
  await page.locator('[data-action="gift-code-open"]').click();
  await box.waitFor({ timeout: 5000 });
  assert(calls.check.at(-1).slug === 'gc1', "the message's code");
  await close(box, 'Escape closes the message code');
  assert(calls.apply.length === 1, 'only the one confirmation applied');
};

await finish(async () => {
  await gridSteps();
  await hideSteps();
  await upgradeSteps();
  await uniqueSteps();
  await convertSteps();
  await othersSteps();
  await linkSteps();
  await codeSteps();
});
