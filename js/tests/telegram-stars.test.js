// Telegram Stars (R-Y176): the balance, the history, a person's gifts,
// hiding a gift, a paid reaction, unlocking paid media, the routes'
// validation, and the page's pure helpers. Fake clients; nothing reaches
// a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStars,
  formPrice,
  giftsOf,
  transactionsOf,
} from '../src/sources/telegram-stars.js';
import { mediaOf, pictureOf } from '../src/sources/telegram-media.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import {
  canAfford,
  clampPaid,
  paidOf,
  paidReactionOf,
  rowLabel,
  signedStars,
  starsText,
} from '../src/web/stars-model.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputPeerSelf: named('InputPeerSelf'),
  InputSavedStarGiftUser: named('InputSavedStarGiftUser'),
  InputInvoiceMessage: named('InputInvoiceMessage'),
  payments: {
    GetStarsStatus: named('GetStarsStatus'),
    GetStarsTransactions: named('GetStarsTransactions'),
    GetSavedStarGifts: named('GetSavedStarGifts'),
    SaveStarGift: named('SaveStarGift'),
    GetPaymentForm: named('GetPaymentForm'),
    SendStarsForm: named('SendStarsForm'),
  },
  messages: { SendPaidReaction: named('SendPaidReaction') },
};

const tools = {
  ...helpers,
  readBigIntFromBuffer: (bytes) =>
    BigInt(`0x${Buffer.from(bytes).toString('hex')}`),
};

const make = (answer, { me = '7' } = {}) => {
  const log = [];
  const reads = [];
  const env = {
    importer: async () => ({ Api, helpers: tools }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    actions: { refreshMessages: async (r) => reads.push(r) },
  };
  const client = {
    ...fakeClient(answer, log),
    getMe: async () => ({ id: BigInt(me) }),
  };
  const remembered = [];
  const stickers = {
    remember: (docs, from) => {
      remembered.push(from);
      return docs.map((d) => ({ id: String(d.id), kind: 'sticker' }));
    },
    onAgain: () => {},
  };
  return {
    ...createStars(env, { userClient: async () => client, stickers }),
    log,
    reads,
    remembered,
  };
};

const amount = (n, nanos = 0) => ({ amount: BigInt(n), nanos });

test('starsStatus: the balance of the user themselves', async () => {
  const { starsStatus, log } = make(() => ({
    balance: amount(120, 500_000_000),
  }));
  assert.deepEqual(await starsStatus(), { ok: true, balance: 120.5 });
  assert.equal(log[0].className, 'GetStarsStatus');
  assert.equal(log[0].peer.className, 'InputPeerSelf');
});

test('starsHistory: sources, signs, refunds, filters and the next page', async () => {
  const history = [
    {
      id: 'a',
      amount: amount(100),
      date: 5,
      peer: { className: 'StarsTransactionPeerFragment' },
    },
    {
      id: 'b',
      amount: amount(-50),
      date: 6,
      gift: true,
      refund: true,
      peer: { className: 'StarsTransactionPeer', peer: { userId: 8n } },
    },
    {
      id: 'c',
      amount: amount(-5),
      date: 7,
      title: 'Photo',
      extendedMedia: [{}],
      peer: { className: 'StarsTransactionPeer', peer: { channelId: 9n } },
    },
  ];
  const { starsHistory, log } = make(() => ({
    balance: amount(10),
    history,
    nextOffset: 'o2',
    users: [{ id: 8n, firstName: 'Ann', lastName: 'Lee' }],
    chats: [{ id: 9n, title: 'Chan' }],
  }));
  const answer = await starsHistory({ filter: 'in', offset: 'o1' });
  assert.equal(answer.next, 'o2');
  assert.equal(answer.balance, 10);
  assert.deepEqual(
    answer.transactions.map((t) => [
      t.id,
      t.amount,
      t.kind,
      t.source,
      t.refund,
    ]),
    [
      ['a', 100, '', { kind: 'fragment', name: '' }, false],
      ['b', -50, 'gift', { kind: 'peer', name: 'Ann Lee' }, true],
      ['c', -5, 'media', { kind: 'peer', name: 'Chan' }, false],
    ]
  );
  assert.equal(log[0].inbound, true);
  assert.equal(log[0].outbound, undefined);
  assert.equal(log[0].offset, 'o1');
  assert.equal(log[0].limit, 30);
  await starsHistory({ filter: 'out' });
  assert.equal(log[1].outbound, true);
  await starsHistory();
  assert.equal(log[2].inbound, undefined);
  assert.equal((await starsHistory({ filter: 'x' })).code, 'failed');
  assert.equal((await starsHistory({ offset: 5 })).code, 'failed');
  assert.equal(log.length, 3, 'the bad ones were not sent');
  assert.deepEqual(transactionsOf({}), []);
});

test('starGifts: sender, anonymous, sticker and a page', async () => {
  const doc = { className: 'Document', id: 55n };
  const saved = [
    {
      msgId: 11,
      fromId: { userId: 8n },
      date: 3,
      gift: { stars: 25, sticker: doc },
      message: { text: 'Hi' },
    },
    {
      msgId: 12,
      nameHidden: true,
      fromId: { userId: 9n },
      date: 4,
      gift: { stars: 5 },
    },
    {
      savedId: 77n,
      date: 5,
      unsaved: true,
      gift: {
        title: 'Unique',
        attributes: [{ className: 'StarGiftAttributeModel', document: doc }],
      },
    },
  ];
  const { starGifts, log, remembered } = make(() => ({
    count: 9,
    gifts: saved,
    nextOffset: 'g2',
    users: [{ id: 8n, firstName: 'Bob' }],
  }));
  const answer = await starGifts({ chat: '7', offset: 'g1' });
  assert.equal(answer.mine, true);
  assert.equal(answer.count, 9);
  assert.equal(answer.next, 'g2');
  assert.deepEqual(
    answer.gifts.map((g) => [
      g.msgId,
      g.fromName,
      g.anonymous,
      g.stars,
      g.hidden,
    ]),
    [
      [11, 'Bob', false, 25, false],
      [12, '', true, 5, false],
      [0, '', true, 0, true],
    ]
  );
  assert.equal(answer.gifts[0].text, 'Hi');
  assert.equal(answer.gifts[0].sticker.id, '55');
  assert.equal(
    answer.gifts[2].sticker.id,
    '55',
    'a unique gift uses its model'
  );
  assert.equal(answer.gifts[2].savedId, '77');
  assert.deepEqual(remembered, ['gift:7', 'gift:7']);
  assert.equal(log[0].offset, 'g1');
  assert.equal(log[0].limit, 24);
  assert.deepEqual(log[0].peer, { chat: '7' });
  assert.equal(
    (await make(() => ({ gifts: [] }), { me: '1' }).starGifts({ chat: '7' }))
      .mine,
    false
  );
  assert.equal((await starGifts({ chat: '-100' })).code, 'failed');
  assert.deepEqual(giftsOf({}), []);
});

test('starGiftSave: unsave or save one gift message, strictly', async () => {
  const { starGiftSave, log } = make(() => ({}));
  assert.deepEqual(await starGiftSave({ chat: '7', msgId: 11, unsave: true }), {
    ok: true,
    hidden: true,
  });
  assert.equal(log[0].className, 'SaveStarGift');
  assert.equal(log[0].unsave, true);
  assert.equal(log[0].stargift.className, 'InputSavedStarGiftUser');
  assert.equal(log[0].stargift.msgId, 11);
  await starGiftSave({ chat: '7', msgId: 11, unsave: false });
  assert.equal(log[1].unsave, false);
  for (const bad of [
    { chat: '7', msgId: 0, unsave: true },
    { chat: '7', msgId: 1 },
    { chat: '-100', msgId: 1, unsave: true },
  ]) {
    assert.equal((await starGiftSave(bad)).code, 'failed');
  }
  assert.equal(log.length, 2, 'the bad ones were not sent');
});

test('paidReaction: a random id, 1 to 2500, errors as codes', async () => {
  const { paidReaction, log, reads } = make(() => ({}));
  assert.deepEqual(await paidReaction({ chat: '-1005', id: 3, count: 25 }), {
    ok: true,
    sent: 25,
  });
  assert.equal(log[0].className, 'SendPaidReaction');
  assert.equal(log[0].msgId, 3);
  assert.equal(log[0].count, 25);
  assert.equal(typeof log[0].randomId, 'bigint');
  assert.deepEqual(reads, [{ chat: '-1005', ids: [3] }], 'read again after');
  await paidReaction({ chat: '-1005', id: 3, count: 25 });
  assert.notEqual(log[0].randomId, log[1].randomId, 'a new id each time');
  for (const count of [0, 2501, 1.5, '5']) {
    assert.equal(
      (await paidReaction({ chat: '-1005', id: 3, count })).code,
      'failed'
    );
  }
  assert.equal(log.length, 2, 'the bad ones were not sent');
  const poor = make(() => telegramError('BALANCE_TOO_LOW'));
  const refused = await poor.paidReaction({ chat: '-1005', id: 3, count: 5 });
  assert.equal(refused.code, 'balance');
  assert.equal(poor.reads.length, 0);
});

test('paidMediaUnlock: the form, only at the shown price, then the form id', async () => {
  const form = {
    formId: 99n,
    invoice: { prices: [{ amount: 30n }, { amount: 20n }] },
  };
  const { paidMediaUnlock, log, reads } = make((r) =>
    r.className === 'GetPaymentForm' ? form : { updates: [] }
  );
  assert.equal(formPrice(form), 50);
  assert.deepEqual(await paidMediaUnlock({ chat: '-1005', id: 2, stars: 50 }), {
    ok: true,
    paid: 50,
  });
  assert.deepEqual(
    log.map((r) => r.className),
    ['GetPaymentForm', 'SendStarsForm']
  );
  assert.equal(log[0].invoice.className, 'InputInvoiceMessage');
  assert.equal(log[0].invoice.msgId, 2);
  assert.equal(log[1].formId, 99n);
  assert.deepEqual(reads, [{ chat: '-1005', ids: [2] }]);
  // The price moved: nothing is paid.
  const changed = await paidMediaUnlock({ chat: '-1005', id: 2, stars: 40 });
  assert.equal(changed.code, 'price');
  assert.equal(log.length, 3, 'only the form was read');
  assert.equal(
    (await paidMediaUnlock({ chat: '-1005', id: 2 })).code,
    'failed'
  );
  const poor = make((r) => {
    if (r.className === 'GetPaymentForm') {
      return form;
    }
    return telegramError('BALANCE_TOO_LOW');
  });
  assert.equal(
    (await poor.paidMediaUnlock({ chat: '-1005', id: 2, stars: 50 })).code,
    'balance'
  );
  assert.equal(poor.reads.length, 0);
});

test('routes: strict bodies, nothing reaches the account when wrong', async () => {
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
    ['stars-status', {}],
    ['stars-history', { filter: 'out', offset: 'x' }],
    ['star-gifts', { chat: '5' }],
    ['star-gift-save', { chat: '5', msgId: 2, unsave: false }],
    ['paid-reaction', { chat: '-1005', id: 1, count: 2500 }],
    ['paid-media-unlock', { chat: '-1005', id: 1, stars: 5 }],
  ];
  for (const [route, body] of ok) {
    assert.equal((await post(route, body, account)).status, 200, route);
  }
  const bad = [
    ['stars-history', { filter: 'sideways' }],
    ['stars-history', { offset: 3 }],
    ['star-gifts', { chat: '-1005' }],
    ['star-gift-save', { chat: '5', msgId: 2 }],
    ['star-gift-save', { chat: '5', msgId: 0, unsave: true }],
    ['paid-reaction', { chat: '-1005', id: 1, count: 2501 }],
    ['paid-reaction', { chat: '-1005', id: 1, count: 0 }],
    ['paid-reaction', { chat: 'x', id: 1, count: 1 }],
    ['paid-media-unlock', { chat: '-1005', id: 1 }],
    ['paid-media-unlock', { chat: '-1005', id: 1, stars: 0 }],
  ];
  const before = calls.length;
  for (const [route, body] of bad) {
    assert.equal((await post(route, body, account)).status, 400, route);
  }
  assert.equal(calls.length, before, 'no bad body was passed on');
});

test('the Api names used all exist in layer 225', async () => {
  const { readFile } = await import('node:fs/promises');
  const tl = await readFile(
    new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
    'utf8'
  );
  for (const name of [
    'payments.getStarsStatus#',
    'payments.getStarsTransactions#',
    'payments.getSavedStarGifts#',
    'payments.saveStarGift#',
    'payments.getPaymentForm#',
    'payments.sendStarsForm#',
    'messages.sendPaidReaction#',
    'inputInvoiceMessage#',
    'inputSavedStarGiftUser#',
    'inputPeerSelf#',
    'reactionPaid#',
    'messageMediaPaidMedia#',
    'messageExtendedMediaPreview#',
  ]) {
    assert.ok(tl.includes(`\n${name}`), name);
  }
});

test('stars-model: amounts, labels, the reaction amount, previews', () => {
  assert.equal(starsText(12), '12');
  assert.equal(starsText(1.5), '1.5');
  assert.equal(signedStars(100), '+100');
  assert.equal(signedStars(-50), '−50');
  assert.deepEqual(rowLabel({ title: 'T', source: {} }), { text: 'T' });
  assert.deepEqual(rowLabel({ kind: 'gift', source: {} }), {
    key: 'chat.stars.kind.gift',
  });
  assert.deepEqual(rowLabel({ source: { kind: 'peer', name: 'Ann' } }), {
    text: 'Ann',
  });
  assert.deepEqual(rowLabel({ source: { kind: 'fragment' } }), {
    key: 'chat.stars.src.fragment',
  });
  assert.equal(clampPaid(0), 1);
  assert.equal(clampPaid(99999), 2500);
  assert.equal(clampPaid('abc'), 1);
  assert.equal(clampPaid(7.9), 7);
  assert.equal(canAfford(10, 25), false);
  assert.equal(canAfford(25, 25), true);
  assert.equal(canAfford(null, 25), true);
  assert.equal(paidOf({ className: 'MessageMediaPhoto' }), null);
  const locked = paidOf({
    className: 'MessageMediaPaidMedia',
    starsAmount: 9,
    extendedMedia: [
      {
        className: 'MessageExtendedMediaPreview',
        w: 4,
        h: 3,
        videoDuration: 12,
      },
    ],
  });
  assert.equal(locked.locked, true);
  assert.equal(locked.stars, 9);
  assert.deepEqual(locked.items[0], {
    unlocked: false,
    w: 4,
    h: 3,
    duration: 12,
    thumb: null,
  });
  const reactions = {
    results: [
      { reaction: { className: 'ReactionEmoji', emoticon: '👍' }, count: 2 },
      { reaction: { className: 'ReactionPaid' }, count: 7 },
    ],
    topReactors: [
      { my: true, count: 3 },
      { anonymous: true, count: 4 },
    ],
  };
  assert.deepEqual(paidReactionOf(reactions), {
    count: 7,
    mine: 3,
    top: [
      { mine: true, anonymous: true, count: 3 },
      { mine: false, anonymous: true, count: 4 },
    ],
  });
  assert.equal(paidReactionOf({ results: [] }), null);
});

test('a message with paid media or a paid reaction, as the page reads it', () => {
  const raw = (media, reactions) => ({
    id: 4,
    media,
    reactions,
  });
  const link = (r) => ({ id: 'msg:telegram:-1005:4', body: '📎', raw: r });
  const preview = {
    className: 'MessageExtendedMediaPreview',
    w: 2,
    h: 2,
  };
  const photo = {
    className: 'MessageMediaPhoto',
    photo: {
      id: '1',
      sizes: [{ className: 'PhotoSize', type: 'm', w: 9, h: 9, size: 1 }],
    },
  };
  const real = { className: 'MessageExtendedMedia', media: photo };
  const paid = (items) => ({
    className: 'MessageMediaPaidMedia',
    starsAmount: 50,
    extendedMedia: items,
  });
  const locked = parseMessageParts(
    link(raw(paid([preview, preview]))),
    new Map()
  );
  assert.equal(locked.media.kind, 'paid');
  assert.equal(locked.media.locked, true);
  assert.equal(locked.media.stars, 50);
  const one = parseMessageParts(link(raw(paid([real]))), new Map());
  assert.equal(one.media.kind, 'photo', 'one unlocked photo is a photo');
  const two = parseMessageParts(link(raw(paid([real, real]))), new Map());
  assert.equal(two.media.kind, 'paid');
  assert.equal(two.media.locked, false);
  const reacted = parseMessageParts(
    link(
      raw(null, {
        results: [{ reaction: { className: 'ReactionPaid' }, count: 3 }],
      })
    ),
    new Map()
  );
  assert.equal(reacted.paidReaction.count, 3);
  assert.deepEqual(reacted.reactions, []);
});

test('the media reader unwraps unlocked paid media by part', () => {
  const photo = (id) => ({
    className: 'MessageMediaPhoto',
    photo: {
      id,
      sizes: [{ className: 'PhotoSize', type: 'm', w: 9, h: 9, size: 1 }],
    },
  });
  const raw = {
    media: {
      className: 'MessageMediaPaidMedia',
      extendedMedia: [
        { className: 'MessageExtendedMedia', media: photo('1') },
        { className: 'MessageExtendedMediaPreview' },
        { className: 'MessageExtendedMedia', media: photo('3') },
      ],
    },
  };
  assert.equal(pictureOf(raw, 'm').file.id, '1');
  assert.equal(pictureOf(raw, 'm', 2).file.id, '3');
  assert.equal(pictureOf(raw, 'm', 1), null, 'a preview has no file');
  assert.equal(pictureOf(raw, 'm', 5), null);
  assert.equal(
    mediaOf({ media: { className: 'MessageMediaPhoto' } }).className,
    'MessageMediaPhoto'
  );
});
