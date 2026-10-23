// Managing received gifts, unique gifts and gift codes (R-Y193): the
// server actions with fake clients, the routes' validation, the price-
// mismatch refusal on upgrade and transfer, and the page's pure helpers.
// Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  codeInfoOf,
  createGiftsManage,
  hexColor,
  pinLimitOf,
  rarityOf,
  refOf,
  validRef,
} from '../src/sources/telegram-gifts-manage.js';
import { giftsOf } from '../src/sources/telegram-stars.js';
import {
  availability,
  backdropStyle,
  giftActions,
  giftCodeCardOf,
  giftCodeSlugOf,
  giftLinkOf,
  giftRef,
  pinnedAfter,
  priceWords,
  rarityWords,
  transferWaits,
} from '../src/web/gift-manage-model.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputSavedStarGiftUser: named('InputSavedStarGiftUser'),
  InputSavedStarGiftChat: named('InputSavedStarGiftChat'),
  InputInvoiceStarGiftUpgrade: named('InputInvoiceStarGiftUpgrade'),
  InputInvoiceStarGiftTransfer: named('InputInvoiceStarGiftTransfer'),
  help: { GetAppConfig: named('GetAppConfig') },
  payments: {
    ConvertStarGift: named('ConvertStarGift'),
    GetStarGiftUpgradePreview: named('GetStarGiftUpgradePreview'),
    UpgradeStarGift: named('UpgradeStarGift'),
    TransferStarGift: named('TransferStarGift'),
    ToggleStarGiftsPinnedToTop: named('ToggleStarGiftsPinnedToTop'),
    GetUniqueStarGift: named('GetUniqueStarGift'),
    CheckGiftCode: named('CheckGiftCode'),
    ApplyGiftCode: named('ApplyGiftCode'),
    GetPaymentForm: named('GetPaymentForm'),
    SendStarsForm: named('SendStarsForm'),
  },
};
const tools = { ...helpers };

const form = (amount) => ({
  formId: 9n,
  invoice: { prices: [{ amount: BigInt(amount) }] },
});

const make = (answer) => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers: tools }),
    connection: { withPeer: async (_c, chat, use) => use({ peer: chat }) },
  };
  const stickers = {
    remember: (docs) =>
      docs.map((d) => ({ id: String(d.id), kind: 'sticker' })),
  };
  const client = fakeClient(answer, log);
  return {
    ...createGiftsManage(env, { userClient: async () => client, stickers }),
    log,
  };
};

const names = (log) => log.map((r) => r.className);

test('giftsOf: what can be done to a gift, as Telegram says it', () => {
  const [plain, unique, prepaid] = giftsOf({
    gifts: [
      {
        msgId: 1,
        date: 1,
        canUpgrade: true,
        convertStars: 40n,
        upgradeStars: 25n,
        pinnedToTop: true,
        gift: { id: 5n, stars: 50n },
      },
      {
        msgId: 2,
        date: 1,
        transferStars: 10n,
        canTransferAt: 99,
        gift: {
          className: 'StarGiftUnique',
          giftId: 6n,
          slug: 'Plush-7',
          num: 7,
          title: 'Plush',
        },
      },
      {
        msgId: 3,
        date: 1,
        canUpgrade: true,
        prepaidUpgradeHash: 'h',
        gift: { id: 8n, stars: 1n, upgradeStars: 30n },
      },
    ],
  });
  assert.equal(plain.giftId, '5');
  assert.equal(plain.canUpgrade, true);
  assert.equal(plain.upgradeStars, 25);
  assert.equal(plain.convertStars, 40);
  assert.equal(plain.pinned, true);
  assert.equal(plain.unique, null);
  assert.deepEqual(unique.unique, { slug: 'Plush-7', num: 7, title: 'Plush' });
  assert.equal(unique.giftId, '6');
  assert.equal(unique.canUpgrade, false);
  assert.equal(unique.transferStars, 10);
  assert.equal(unique.canTransferAt, 99);
  assert.equal(prepaid.prepaid, true);
  assert.equal(prepaid.upgradeStars, 0, 'a prepaid upgrade is free');
});

test('refs: a person names a gift by msgId, a chat by savedId', () => {
  assert.equal(validRef({ chat: '7', msgId: 3 }), true);
  assert.equal(validRef({ chat: '-1005', savedId: '12' }), true);
  assert.equal(validRef({ chat: '7', savedId: '12' }), true);
  for (const bad of [
    { chat: '7' },
    { chat: '7', msgId: 0 },
    { chat: '-1005', msgId: 3 },
    { chat: '7', msgId: 3, savedId: '1' },
    { chat: 'x', msgId: 3 },
    { chat: '7', savedId: 'abc' },
  ]) {
    assert.equal(validRef(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual(refOf({ chat: 7, msgId: 3, junk: 1 }), {
    chat: '7',
    msgId: 3,
  });
  assert.deepEqual(refOf({ chat: '7', savedId: '4' }), {
    chat: '7',
    savedId: '4',
  });
});

test('giftConvert: one convertStarGift, strictly, errors as codes', async () => {
  const { giftConvert, log } = make(() => true);
  assert.deepEqual(await giftConvert({ chat: '7', msgId: 3 }), { ok: true });
  assert.equal(log[0].className, 'ConvertStarGift');
  assert.equal(log[0].stargift.className, 'InputSavedStarGiftUser');
  assert.equal(log[0].stargift.msgId, 3);
  await giftConvert({ chat: '-1005', savedId: '12' });
  assert.equal(log[1].stargift.className, 'InputSavedStarGiftChat');
  assert.equal(log[1].stargift.savedId, 12n);
  assert.deepEqual(log[1].stargift.peer, { peer: '-1005' });
  assert.equal((await giftConvert({ chat: '7' })).code, 'failed');
  assert.equal(log.length, 2, 'the bad one was not sent');
  const errors = {
    STARGIFT_CONVERT_TOO_OLD: 'too-old',
    STARGIFT_ALREADY_CONVERTED: 'already',
    SAVED_ID_EMPTY: 'no-gift',
  };
  for (const [name, code] of Object.entries(errors)) {
    const failing = make(() => telegramError(name));
    assert.equal(
      (await failing.giftConvert({ chat: '7', msgId: 1 })).code,
      code
    );
  }
});

test('giftUpgradePreview: names, rarities, colours and prices; no write', async () => {
  const doc = { className: 'Document', id: 4n };
  const { giftUpgradePreview, log } = make(() => ({
    sampleAttributes: [
      {
        className: 'StarGiftAttributeModel',
        name: 'Gold',
        document: doc,
        rarity: { className: 'StarGiftAttributeRarity', permille: 15 },
      },
      {
        className: 'StarGiftAttributePattern',
        name: 'Stars',
        document: doc,
        rarity: { className: 'StarGiftAttributeRarityRare' },
      },
      {
        className: 'StarGiftAttributeBackdrop',
        name: 'Ocean',
        centerColor: 0x112233,
        edgeColor: 0xaabbcc,
        rarity: { className: 'StarGiftAttributeRarityLegendary' },
      },
    ],
    prices: [{ date: 100, upgradeStars: 25n }],
  }));
  const answer = await giftUpgradePreview({ giftId: '5' });
  assert.equal(log[0].className, 'GetStarGiftUpgradePreview');
  assert.equal(log[0].giftId, 5n);
  assert.deepEqual(answer.models, [
    { name: 'Gold', permille: 15, sticker: { id: '4', kind: 'sticker' } },
  ]);
  assert.equal(answer.patterns[0].rarity, 'rare');
  assert.deepEqual(answer.backdrops, [
    { name: 'Ocean', rarity: 'legendary', center: '#112233', edge: '#aabbcc' },
  ]);
  assert.deepEqual(answer.prices, [{ date: 100, stars: 25 }]);
  assert.equal((await giftUpgradePreview({ giftId: 'x' })).code, 'failed');
});

test('giftUpgrade: free calls upgradeStarGift; paid goes through the form', async () => {
  const free = make(() => ({}));
  assert.deepEqual(
    await free.giftUpgrade({
      chat: '7',
      msgId: 3,
      stars: 0,
      keepDetails: true,
    }),
    { ok: true, paid: 0 }
  );
  assert.deepEqual(names(free.log), ['UpgradeStarGift']);
  assert.equal(free.log[0].keepOriginalDetails, true);
  assert.equal(free.log[0].stargift.msgId, 3);

  const paid = make((r) =>
    r.className === 'GetPaymentForm' ? form(25) : { className: 'Updates' }
  );
  assert.deepEqual(await paid.giftUpgrade({ chat: '7', msgId: 3, stars: 25 }), {
    ok: true,
    paid: 25,
  });
  assert.deepEqual(names(paid.log), ['GetPaymentForm', 'SendStarsForm']);
  assert.equal(paid.log[0].invoice.className, 'InputInvoiceStarGiftUpgrade');
  assert.equal(paid.log[1].formId, 9n);
});

test('giftUpgrade: a price that is not the one shown pays nothing', async () => {
  const dearer = make((r) =>
    r.className === 'GetPaymentForm' ? form(40) : {}
  );
  const answer = await dearer.giftUpgrade({ chat: '7', msgId: 3, stars: 25 });
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'price');
  assert.deepEqual(names(dearer.log), ['GetPaymentForm']);
  const verify = make((r) =>
    r.className === 'GetPaymentForm'
      ? form(25)
      : { className: 'payments.PaymentVerificationNeeded' }
  );
  assert.equal(
    (await verify.giftUpgrade({ chat: '7', msgId: 3, stars: 25 })).code,
    'verify'
  );
  const refused = make(() => telegramError('STARGIFT_UPGRADE_UNAVAILABLE'));
  assert.equal(
    (await refused.giftUpgrade({ chat: '7', msgId: 3, stars: 0 })).code,
    'cannot-upgrade'
  );
  const needs = make(() => telegramError('PAYMENT_REQUIRED'));
  assert.equal(
    (await needs.giftUpgrade({ chat: '7', msgId: 3, stars: 0 })).code,
    'price',
    'a free upgrade that costs is refused as a price change'
  );
  for (const bad of [
    { chat: '7', msgId: 3 },
    { chat: '7', msgId: 3, stars: -1 },
    { chat: '7', msgId: 3, stars: 1.5 },
    { chat: '7', msgId: 3, stars: 0, keepDetails: 'yes' },
  ]) {
    assert.equal((await dearer.giftUpgrade(bad)).code, 'failed');
  }
  assert.equal(dearer.log.length, 1, 'the bad ones were not sent');
});

test('giftTransfer: free or paid to a person, refused when the price differs', async () => {
  const free = make(() => ({}));
  assert.deepEqual(
    await free.giftTransfer({ chat: '7', msgId: 3, to: '42', stars: 0 }),
    { ok: true, paid: 0 }
  );
  assert.equal(free.log[0].className, 'TransferStarGift');
  assert.deepEqual(free.log[0].toId, { peer: '42' });

  const paid = make((r) =>
    r.className === 'GetPaymentForm' ? form(10) : { className: 'Updates' }
  );
  assert.equal(
    (await paid.giftTransfer({ chat: '7', msgId: 3, to: '42', stars: 10 }))
      .paid,
    10
  );
  assert.equal(paid.log[0].invoice.className, 'InputInvoiceStarGiftTransfer');
  assert.deepEqual(paid.log[0].invoice.toId, { peer: '42' });

  const changed = make((r) =>
    r.className === 'GetPaymentForm' ? form(99) : {}
  );
  const refused = await changed.giftTransfer({
    chat: '7',
    msgId: 3,
    to: '42',
    stars: 10,
  });
  assert.equal(refused.code, 'price');
  assert.deepEqual(names(changed.log), ['GetPaymentForm'], 'nothing was paid');

  for (const bad of [
    { chat: '7', msgId: 3, stars: 0 },
    { chat: '7', msgId: 3, to: 'bob', stars: 0 },
    { chat: '7', msgId: 3, to: '42' },
    { chat: '7', to: '42', stars: 0 },
  ]) {
    assert.equal((await changed.giftTransfer(bad)).code, 'failed');
  }
  const early = make(() => telegramError('STARGIFT_TRANSFER_TOO_EARLY_3600'));
  assert.equal(
    (await early.giftTransfer({ chat: '7', msgId: 3, to: '42', stars: 0 }))
      .code,
    'too-early'
  );
});

test('giftPin: the pinned list, up to the config limit (else 6)', async () => {
  const config = (limit) => ({
    className: 'help.AppConfig',
    config: {
      value: [
        { key: 'other', value: { value: 1 } },
        { key: 'stargifts_pinned_to_top_limit', value: { value: limit } },
      ],
    },
  });
  const pins = [{ msgId: 3 }, { msgId: 4 }, { savedId: '9' }];
  const { giftPin, log } = make((r) =>
    r.className === 'GetAppConfig' ? config(3) : true
  );
  const answer = await giftPin({ chat: '7', pins });
  assert.deepEqual(answer, { ok: true, pinned: 3, limit: 3 });
  const set = log.find((r) => r.className === 'ToggleStarGiftsPinnedToTop');
  assert.deepEqual(
    set.stargift.map((s) => s.className),
    [
      'InputSavedStarGiftUser',
      'InputSavedStarGiftUser',
      'InputSavedStarGiftChat',
    ]
  );
  assert.deepEqual(set.peer, { peer: '7' });
  const more = await giftPin({ chat: '7', pins: [...pins, { msgId: 5 }] });
  assert.equal(more.code, 'pin-limit');
  assert.equal(more.limit, 3);
  assert.equal(
    log.filter((r) => r.className === 'ToggleStarGiftsPinnedToTop').length,
    1,
    'the one over the limit was not sent'
  );
  const lost = make((r) =>
    r.className === 'GetAppConfig' ? telegramError('X') : true
  );
  assert.equal(
    (await lost.giftPin({ chat: '7', pins: Array(7).fill({ msgId: 1 }) }))
      .limit,
    6
  );
  assert.equal((await lost.giftPin({ chat: '7', pins: 'no' })).code, 'failed');
  assert.equal(pinLimitOf({}), 6);
  assert.equal(pinLimitOf(config(9)), 9);
  assert.equal(pinLimitOf(config(0)), 6);
});

const unique = {
  className: 'StarGiftUnique',
  slug: 'Plush-7',
  title: 'Plush',
  num: 7,
  availabilityIssued: 7,
  availabilityTotal: 100,
  ownerId: { userId: 8n },
  attributes: [
    {
      className: 'StarGiftAttributeModel',
      name: 'Gold',
      document: { className: 'Document', id: 4n },
      rarity: { className: 'StarGiftAttributeRarity', permille: 5 },
    },
    {
      className: 'StarGiftAttributePattern',
      name: 'Stars',
      document: { className: 'Document', id: 5n },
      rarity: { className: 'StarGiftAttributeRarityEpic' },
    },
    {
      className: 'StarGiftAttributeBackdrop',
      name: 'Ocean',
      centerColor: 0x112233,
      edgeColor: 0x445566,
      patternColor: 0x778899,
      textColor: 0xffffff,
      rarity: { className: 'StarGiftAttributeRarityUncommon' },
    },
  ],
};

test('giftUnique: model, backdrop, pattern, number, owner, availability', async () => {
  const { giftUnique, log } = make(() => ({
    gift: unique,
    users: [{ id: 8n, firstName: 'Ann', lastName: 'Lee' }],
  }));
  const { gift } = await giftUnique({ slug: 'Plush-7' });
  assert.equal(log[0].className, 'GetUniqueStarGift');
  assert.equal(log[0].slug, 'Plush-7');
  assert.equal(gift.title, 'Plush');
  assert.equal(gift.num, 7);
  assert.equal(gift.issued, 7);
  assert.equal(gift.total, 100);
  assert.deepEqual(gift.owner, { id: '8', name: 'Ann Lee' });
  assert.equal(gift.model.permille, 5);
  assert.equal(gift.model.sticker.id, '4');
  assert.equal(gift.pattern.rarity, 'epic');
  assert.deepEqual(gift.backdrop, {
    name: 'Ocean',
    rarity: 'uncommon',
    center: '#112233',
    edge: '#445566',
    pattern: '#778899',
    text: '#ffffff',
  });
  assert.equal((await giftUnique({ slug: 'a/b' })).code, 'failed');
  assert.equal((await giftUnique({})).code, 'failed');
  const regular = make(() => ({ gift: { className: 'StarGift' } }));
  assert.equal((await regular.giftUnique({ slug: 'x' })).code, 'no-gift');
  const gone = make(() => telegramError('STARGIFT_SLUG_INVALID'));
  assert.equal((await gone.giftUnique({ slug: 'x' })).code, 'no-gift');
});

test('giftCodeCheck and giftCodeApply: months, from, date, used', async () => {
  const checked = {
    viaGiveaway: true,
    fromId: { channelId: 9n },
    date: 1000,
    days: 90,
    usedDate: 2000,
    chats: [{ id: 9n, title: 'Chan' }],
  };
  const { giftCodeCheck, giftCodeApply, log } = make(() => checked);
  const { info } = await giftCodeCheck({ slug: 'abc123' });
  assert.equal(log[0].className, 'CheckGiftCode');
  assert.deepEqual(info, {
    slug: 'abc123',
    days: 90,
    months: 3,
    from: { id: '9', name: 'Chan' },
    viaGiveaway: true,
    date: 1000,
    used: true,
    usedDate: 2000,
    to: null,
  });
  assert.equal(log.length, 1, 'checking applies nothing');
  const fresh = codeInfoOf({ days: 365, date: 5 });
  assert.equal(fresh.months, 12);
  assert.equal(fresh.used, false);
  assert.equal(fresh.from, null);
  assert.deepEqual(await giftCodeApply({ slug: 'abc123' }), { ok: true });
  assert.equal(log[1].className, 'ApplyGiftCode');
  assert.equal(log[1].slug, 'abc123');
  assert.equal((await giftCodeApply({ slug: '' })).code, 'failed');
  assert.equal((await giftCodeCheck({ slug: 'a b' })).code, 'failed');
  const errors = {
    GIFT_SLUG_EXPIRED: 'code-expired',
    GIFT_SLUG_INVALID: 'no-code',
    GIFTCODE_NOT_ALLOWED: 'not-allowed',
    PREMIUM_SUB_ACTIVE_UNTIL_1900000000: 'premium-active',
  };
  for (const [name, code] of Object.entries(errors)) {
    const failing = make(() => telegramError(name));
    assert.equal((await failing.giftCodeApply({ slug: 'x' })).code, code);
  }
});

test('the routes validate strictly before the account is asked', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    }
  );
  const ok = [
    ['gift-convert', { chat: '5', msgId: 2 }],
    ['gift-convert', { chat: '-1005', savedId: '77' }],
    ['gift-upgrade-preview', { giftId: '123' }],
    ['gift-upgrade', { chat: '5', msgId: 2, stars: 0 }],
    ['gift-upgrade', { chat: '5', msgId: 2, stars: 25, keepDetails: true }],
    ['gift-transfer', { chat: '5', msgId: 2, to: '8', stars: 10 }],
    ['gift-pin', { chat: '5', pins: [{ msgId: 2 }, { savedId: '4' }] }],
    ['gift-pin', { chat: '5', pins: [] }],
    ['gift-unique', { slug: 'Plush-7' }],
    ['gift-code-check', { slug: 'abc' }],
    ['gift-code-apply', { slug: 'abc' }],
  ];
  for (const [route, body] of ok) {
    assert.equal((await post(route, body, account)).status, 200, route);
  }
  const bad = [
    ['gift-convert', { chat: '5' }],
    ['gift-convert', { chat: '5', msgId: 0 }],
    ['gift-convert', { chat: '-1005', msgId: 2 }],
    ['gift-upgrade-preview', { giftId: 'x' }],
    ['gift-upgrade-preview', {}],
    ['gift-upgrade', { chat: '5', msgId: 2 }],
    ['gift-upgrade', { chat: '5', msgId: 2, stars: -1 }],
    ['gift-upgrade', { chat: '5', msgId: 2, stars: '5' }],
    ['gift-upgrade', { chat: '5', msgId: 2, stars: 0, keepDetails: 1 }],
    ['gift-transfer', { chat: '5', msgId: 2, stars: 0 }],
    ['gift-transfer', { chat: '5', msgId: 2, to: 'bob', stars: 0 }],
    ['gift-transfer', { chat: '5', msgId: 2, to: '8' }],
    ['gift-pin', { chat: '5' }],
    ['gift-pin', { chat: '5', pins: [{ msgId: 0 }] }],
    ['gift-pin', { chat: '5', pins: Array(101).fill({ msgId: 1 }) }],
    ['gift-unique', { slug: 'a/b' }],
    ['gift-unique', {}],
    ['gift-code-check', { slug: '' }],
    ['gift-code-apply', { slug: 'a b' }],
    ['gift-code-apply', { slug: 5 }],
  ];
  const before = calls.length;
  for (const [route, body] of bad) {
    assert.equal((await post(route, body, account)).status, 400, route);
  }
  assert.equal(calls.length, before, 'no bad body was passed on');
  const passed = calls.find(([name]) => name === 'giftUpgrade');
  assert.deepEqual(passed[1], { chat: '5', msgId: 2, stars: 0 });
});

test('the Api names used all exist in layer 225', async () => {
  const { readFile } = await import('node:fs/promises');
  const tl = await readFile(
    new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
    'utf8'
  );
  for (const name of [
    'payments.getSavedStarGifts#',
    'payments.saveStarGift#',
    'payments.convertStarGift#',
    'payments.upgradeStarGift#',
    'payments.transferStarGift#',
    'payments.getUniqueStarGift#',
    'payments.getStarGiftUpgradePreview#',
    'payments.toggleStarGiftsPinnedToTop#',
    'payments.checkGiftCode#',
    'payments.applyGiftCode#',
    'help.getAppConfig#',
    'inputSavedStarGiftUser#',
    'inputSavedStarGiftChat#',
    'inputInvoiceStarGiftUpgrade#',
    'inputInvoiceStarGiftTransfer#',
    'starGiftUnique#',
    'payments.checkedGiftCode#',
    'messageActionGiftCode#',
  ]) {
    assert.ok(tl.includes(`\n${name}`), name);
  }
});

test('helpers: colours and rarities', () => {
  assert.equal(hexColor(0xff0000), '#ff0000');
  assert.equal(hexColor(0x00ff), '#0000ff');
  assert.equal(hexColor(-1), '#ffffff');
  assert.deepEqual(
    rarityOf({ className: 'StarGiftAttributeRarity', permille: 12 }),
    {
      permille: 12,
    }
  );
  assert.deepEqual(rarityOf({ className: 'StarGiftAttributeRarityRare' }), {
    rarity: 'rare',
  });
  assert.deepEqual(rarityOf(null), { rarity: '' });
});

test('page: gift links, t.me/nft and t.me/giftcode, and tg://', () => {
  assert.deepEqual(giftLinkOf('https://t.me/nft/Plush-7'), {
    kind: 'unique',
    slug: 'Plush-7',
  });
  assert.deepEqual(giftLinkOf('http://telegram.me/giftcode/abcDEF123'), {
    kind: 'code',
    slug: 'abcDEF123',
  });
  assert.deepEqual(giftLinkOf('tg://nft?slug=Plush-7'), {
    kind: 'unique',
    slug: 'Plush-7',
  });
  assert.deepEqual(giftLinkOf('tg://giftcode?slug=zzz'), {
    kind: 'code',
    slug: 'zzz',
  });
  for (const no of [
    'https://t.me/nft',
    'https://t.me/nft/a/b',
    'https://t.me/other/abc',
    'https://example.com/nft/abc',
    'https://u:p@t.me/nft/abc',
    'https://t.me/nft/a%20b',
    'tg://nft',
    'ftp://t.me/nft/abc',
    'nope',
    '',
    null,
  ]) {
    assert.equal(giftLinkOf(no), null, String(no));
  }
});

test('page: what the owner may do, and what others may see', () => {
  const plain = { msgId: 3, convertStars: 40, canUpgrade: true, unique: null };
  assert.deepEqual(giftActions(plain, true), {
    toggle: true,
    convert: true,
    upgrade: true,
    transfer: false,
    pin: true,
    view: false,
  });
  assert.deepEqual(giftActions(plain, false), {
    toggle: false,
    convert: false,
    upgrade: false,
    transfer: false,
    pin: false,
    view: false,
  });
  const uniqueGift = { msgId: 4, unique: { slug: 'P-1', num: 1 } };
  assert.deepEqual(giftActions(uniqueGift, true), {
    toggle: true,
    convert: false,
    upgrade: false,
    transfer: true,
    pin: true,
    view: true,
  });
  assert.equal(giftActions(uniqueGift, false).view, true, 'read-only view');
  assert.equal(giftActions({ savedId: '9', unique: null }, true).pin, true);
  assert.equal(
    giftActions({ msgId: 1, convertStars: 0, unique: null }, true).convert,
    false
  );
});

test('page: refs, pinned lists, transfer waiting, words', () => {
  assert.deepEqual(giftRef({ msgId: 3 }, 7), { chat: '7', msgId: 3 });
  assert.deepEqual(giftRef({ msgId: 0, savedId: '12' }, '-1005'), {
    chat: '-1005',
    savedId: '12',
  });
  const gifts = [
    { msgId: 1, pinned: true },
    { msgId: 2, pinned: false },
    { savedId: '9', pinned: true },
  ];
  assert.deepEqual(pinnedAfter(gifts, gifts[1], true), [
    { msgId: 2 },
    { msgId: 1 },
    { savedId: '9' },
  ]);
  assert.deepEqual(pinnedAfter(gifts, gifts[0], false), [{ savedId: '9' }]);
  assert.deepEqual(pinnedAfter(gifts, gifts[0], true), [
    { msgId: 1 },
    { savedId: '9' },
  ]);
  assert.equal(transferWaits({ canTransferAt: 100 }, 99_000), true);
  assert.equal(transferWaits({ canTransferAt: 100 }, 101_000), false);
  assert.equal(transferWaits({}, 5), false);
  assert.deepEqual(priceWords(25), {
    key: 'chat.giftManage.priceStars',
    params: { count: 25 },
  });
  assert.equal(priceWords(0).key, 'chat.giftManage.priceFree');
  assert.deepEqual(rarityWords({ permille: 15 }), { text: '1.5%' });
  assert.deepEqual(rarityWords({ rarity: 'epic' }), {
    key: 'chat.giftManage.rarity.epic',
  });
  assert.equal(rarityWords({ rarity: '' }), null);
  assert.deepEqual(availability({ issued: 3, total: 100 }), {
    issued: 3,
    total: 100,
  });
  assert.equal(availability({ issued: 0, total: 0 }), null);
  assert.match(
    backdropStyle({ center: '#111', edge: '#222', text: '#fff' }).background,
    /#111.*#222/
  );
  assert.deepEqual(backdropStyle(null), {});
});

test('page: gift code messages, as an action or as media', () => {
  assert.equal(giftCodeSlugOf({ action: { slug: 'abc' } }), 'abc');
  assert.equal(giftCodeSlugOf({ media: { slug: 'def' } }), 'def');
  assert.equal(giftCodeSlugOf({ action: { slug: 'a b' } }), null);
  assert.equal(giftCodeSlugOf({}), null);
  assert.deepEqual(giftCodeCardOf({ slug: 'abc', days: 180 }), {
    kind: 'gift-code',
    slug: 'abc',
    months: 6,
  });
  const line = parseMessageParts({
    service: 'MessageActionGiftCode',
    raw: {
      action: { className: 'MessageActionGiftCode', slug: 'abc', days: 90 },
    },
  });
  assert.equal(line.service.key, 'chat.service.giftCode');
  const card = parseMessageParts({
    id: 'm',
    body: '',
    raw: { media: { className: 'MessageMediaGiftCode', slug: 'x1', days: 30 } },
  });
  assert.equal(card.media.kind, 'gift-code');
});
