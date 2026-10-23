// Stories and music on a profile, and sending a gift (R-Y185): the pinned
// stories, albums, archive and the two writes (pin, pin to top); a person's
// saved music, adding a song from a message and removing one; the gift
// catalogue (kept by its hash) and sending a gift (only at the shown
// price); the routes' validation and the page's pure helpers. Fake
// clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createProfileStories } from '../src/sources/telegram-profile-stories.js';
import {
  createProfileMusic,
  isSong,
  trackOf,
} from '../src/sources/telegram-profile-music.js';
import { createGiftSend, giftCard } from '../src/sources/telegram-gift-send.js';
import {
  catalogueOrder,
  giftText,
  storiesInOrder,
  topIds,
  trackLine,
} from '../src/web/profile-stories-model.js';
import { isSongMessage } from '../src/web/chat-music-save.js';
import { menuItems } from '../src/web/chat-selection.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputPeerSelf: named('InputPeerSelf'),
  InputUser: named('InputUser'),
  InputUserSelf: named('InputUserSelf'),
  InputDocument: named('InputDocument'),
  InputInvoiceStarGift: named('InputInvoiceStarGift'),
  TextWithEntities: named('TextWithEntities'),
  stories: {
    GetPinnedStories: named('GetPinnedStories'),
    GetAlbumStories: named('GetAlbumStories'),
    GetAlbums: named('GetAlbums'),
    GetStoriesArchive: named('GetStoriesArchive'),
    TogglePinned: named('TogglePinned'),
    TogglePinnedToTop: named('TogglePinnedToTop'),
  },
  users: { GetSavedMusic: named('GetSavedMusic') },
  account: { SaveMusic: named('SaveMusic') },
  payments: {
    GetStarGifts: named('GetStarGifts'),
    CheckCanSendGift: named('CheckCanSendGift'),
    GetPaymentForm: named('GetPaymentForm'),
    SendStarsForm: named('SendStarsForm'),
  },
};

const tools = { ...helpers, returnBigInt: (v) => BigInt(v) };

const make = (create, answer, { me = '7', extra = {}, context = {} } = {}) => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers: tools }),
    connection: {
      withPeer: async (_c, chat, use) =>
        use(
          chat === me
            ? new Api.InputPeerSelf()
            : new Api.InputUser({ userId: BigInt(chat), accessHash: 1n })
        ),
    },
  };
  const client = {
    ...fakeClient(answer, log),
    getMe: async () => ({ id: BigInt(me) }),
    ...extra,
  };
  return {
    ...create(env, { userClient: async () => client, ...context }),
    log,
  };
};

const photoStory = (id, extra = {}) => ({
  className: 'StoryItem',
  id,
  date: 100 + id,
  expireDate: 200,
  caption: `story ${id}`,
  media: {
    className: 'MessageMediaPhoto',
    photo: {
      sizes: [{ className: 'PhotoSize', type: 'w', w: 9, h: 16, size: 5 }],
    },
  },
  ...extra,
});

// ---- stories ----------------------------------------------------------------

test('profileStories: pinned stories, those on top, albums on the first page', async () => {
  const { profileStories, log } = make(createProfileStories, (r) => {
    if (r.className === 'GetAlbums') {
      return { albums: [{ albumId: 4, title: 'Trips' }] };
    }
    return {
      count: 2,
      stories: [
        photoStory(5, { pinned: true }),
        photoStory(3, { pinned: true }),
        { className: 'StoryItemDeleted', id: 2 },
      ],
      pinnedToTop: [3],
    };
  });
  const answer = await profileStories({ chat: '9' });
  assert.equal(answer.ok, true);
  assert.deepEqual(
    answer.stories.map((s) => [s.id, s.top, s.pinned]),
    [
      [5, false, true],
      [3, true, true],
    ]
  );
  assert.deepEqual(answer.albums, [{ id: 4, title: 'Trips' }]);
  assert.equal(answer.mine, false);
  assert.equal(answer.next, null, 'a short page is the last');
  assert.equal(log[0].className, 'GetPinnedStories');
  assert.equal(log[0].offsetId, 0);
  assert.equal(log[0].limit, 30);
});

test("profileStories: an album pages by a count; one's own profile is mine", async () => {
  const stories = Array.from({ length: 2 }, (_, i) => photoStory(i + 1));
  const { profileStories, log } = make(createProfileStories, () => ({
    count: 5,
    stories,
  }));
  const answer = await profileStories({ chat: '7', album: 4, offset: 2 });
  assert.equal(answer.mine, true);
  assert.equal(answer.next, 4);
  assert.deepEqual(answer.albums, [], 'albums only with the first page');
  assert.equal(log[0].className, 'GetAlbumStories');
  assert.equal(log[0].albumId, 4);
  assert.equal(log[0].offset, 2);
  assert.equal((await profileStories({ chat: 'x' })).code, 'failed');
  assert.equal((await profileStories({ chat: '9', album: 0 })).code, 'failed');
  assert.equal(log.length, 1, 'bad requests were not sent');
});

test('profileStories: albums that Telegram refuses are none', async () => {
  const { profileStories } = make(createProfileStories, (r) =>
    r.className === 'GetAlbums'
      ? telegramError('STORIES_NEVER_CREATED')
      : { count: 0, stories: [] }
  );
  const answer = await profileStories({ chat: '9' });
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.albums, []);
});

test("storiesArchive: one's own, a full page continues from the lowest id", async () => {
  const stories = Array.from({ length: 30 }, (_, i) => photoStory(100 - i));
  const { storiesArchive, log } = make(createProfileStories, () => ({
    count: 80,
    stories,
  }));
  const answer = await storiesArchive({ offset: 0 });
  assert.equal(answer.stories.length, 30);
  assert.equal(answer.next, 71);
  assert.equal(answer.me, '7');
  assert.equal(log[0].peer.className, 'InputPeerSelf');
  assert.equal((await storiesArchive({ offset: -1 })).code, 'failed');
});

test('storyPin and storyPinTop: the writes, validated', async () => {
  const { storyPin, storyPinTop, log } = make(createProfileStories, (r) =>
    r.className === 'TogglePinned' ? [3] : true
  );
  assert.deepEqual(await storyPin({ chat: '7', ids: [3], pinned: false }), {
    ok: true,
    pinned: false,
    ids: [3],
  });
  assert.equal(log[0].className, 'TogglePinned');
  assert.deepEqual(log[0].id, [3]);
  assert.equal(log[0].pinned, false);
  assert.deepEqual(await storyPinTop({ chat: '7', ids: [3, 4] }), {
    ok: true,
    ids: [3, 4],
  });
  assert.equal(log[1].className, 'TogglePinnedToTop');
  assert.equal(
    (await storyPinTop({ chat: '7', ids: [] })).ok,
    true,
    'an empty list clears'
  );
  assert.equal(
    (await storyPinTop({ chat: '7', ids: [1, 2, 3, 4] })).code,
    'failed'
  );
  assert.equal(
    (await storyPin({ chat: '7', ids: [], pinned: true })).code,
    'failed'
  );
  assert.equal(
    (await storyPin({ chat: '7', ids: [1], pinned: 'yes' })).code,
    'failed'
  );
  assert.equal(log.length, 3);
  const full = make(createProfileStories, () =>
    telegramError('PINNED_TOO_MUCH')
  );
  assert.equal(
    (await full.storyPinTop({ chat: '7', ids: [1] })).code,
    'too-many'
  );
});

// ---- music ------------------------------------------------------------------

const song = (id, extra = {}) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: 5n,
  fileReference: Buffer.from([1]),
  size: 1000,
  dcId: 2,
  mimeType: 'audio/mpeg',
  attributes: [
    {
      className: 'DocumentAttributeAudio',
      title: 'Song',
      performer: 'Band',
      duration: 61,
    },
  ],
  ...extra,
});
const voice = song(9, {
  attributes: [
    { className: 'DocumentAttributeAudio', voice: true, duration: 3 },
  ],
});

test("savedMusic: a person's songs (not voice notes), mine, the next page", async () => {
  const { savedMusic, log } = make(createProfileMusic, () => ({
    count: 40,
    documents: [
      song(1),
      voice,
      song(2, {
        attributes: [
          { className: 'DocumentAttributeFilename', fileName: 'x.mp3' },
        ],
      }),
    ],
  }));
  const answer = await savedMusic({ chat: '9' });
  assert.deepEqual(
    answer.tracks.map((t) => [t.id, t.title, t.performer, t.duration]),
    [
      ['1', 'Song', 'Band', 61],
      ['2', 'x', '', 0],
    ]
  );
  assert.equal(answer.mine, false);
  assert.equal(answer.next, 2);
  assert.equal(log[0].className, 'GetSavedMusic');
  assert.equal(log[0].id.className, 'InputUser');
  assert.equal(log[0].limit, 30);
  const own = await savedMusic({ chat: '7' });
  assert.equal(own.mine, true);
  assert.equal(log[1].id.className, 'InputUserSelf');
  assert.equal((await savedMusic({ chat: '9', offset: -2 })).code, 'failed');
  assert.equal(isSong(voice), false);
  assert.equal(trackLine(trackOf(song(1))), 'Song — Band');
});

test('messageMusicSave: reads the message, saves its song, refuses a voice note', async () => {
  let media = song(11);
  const { messageMusicSave, log } = make(createProfileMusic, () => true, {
    extra: { getMessages: async () => [{ media: { document: media } }] },
  });
  assert.deepEqual(await messageMusicSave({ chat: '9', message: 4 }), {
    ok: true,
    id: '11',
    saved: true,
  });
  assert.equal(log[0].className, 'SaveMusic');
  assert.equal(log[0].unsave, false);
  assert.equal(log[0].id.className, 'InputDocument');
  media = voice;
  assert.equal(
    (await messageMusicSave({ chat: '9', message: 4 })).code,
    'not-music'
  );
  assert.equal(log.length, 1);
  assert.equal(
    (await messageMusicSave({ chat: '9', message: 0 })).code,
    'failed'
  );
});

test('musicRemove: only a track the list showed, with unsave', async () => {
  const { savedMusic, musicRemove, log } = make(createProfileMusic, () => ({
    count: 1,
    documents: [song(21)],
  }));
  assert.equal((await musicRemove({ id: '21' })).code, 'no-track');
  await savedMusic({ chat: '7' });
  assert.deepEqual(await musicRemove({ id: '21' }), { ok: true, id: '21' });
  assert.equal(log.at(-1).className, 'SaveMusic');
  assert.equal(log.at(-1).unsave, true);
  assert.equal((await musicRemove({ id: 'x' })).code, 'failed');
});

test('the message menu offers "Add to profile music" on a song only', () => {
  const message = (document) => ({
    id: 'a',
    source: 'telegram',
    body: '',
    raw: { id: 5, media: { className: 'MessageMediaDocument', document } },
  });
  assert.equal(isSongMessage(message(song(1))), true);
  assert.equal(isSongMessage(message(voice)), false);
  const items = (m) =>
    menuItems({
      message: m,
      chat: { chat: '9', source: 'telegram' },
      info: null,
    });
  assert.ok(items(message(song(1))).includes('saveMessageMusic'));
  assert.ok(!items(message(voice)).includes('saveMessageMusic'));
});

// ---- the gift ---------------------------------------------------------------

const gift = (id, stars, extra = {}) => ({
  className: 'StarGift',
  id: BigInt(id),
  stars: BigInt(stars),
  sticker: { className: 'Document', id: BigInt(id) },
  ...extra,
});

const makeGift = (answer, options = {}) => {
  const remembered = [];
  const made = make(createGiftSend, answer, {
    ...options,
    context: {
      stickers: {
        remember: (docs, from) => {
          remembered.push(from);
          return docs.map((d) => ({ id: String(d.id), kind: 'sticker' }));
        },
        onAgain: () => {},
      },
    },
  });
  return { ...made, remembered };
};

test('giftCatalogue: prices, limited and sold-out marks, kept by its hash', async () => {
  let version = 0;
  const { giftCatalogue, log } = makeGift(() => {
    version += 1;
    return version === 1
      ? {
          className: 'payments.StarGifts',
          hash: 77,
          gifts: [
            gift(1, 15),
            gift(2, 100, {
              limited: true,
              availabilityRemains: 3,
              availabilityTotal: 10,
            }),
            gift(3, 50, {
              limited: true,
              soldOut: true,
              availabilityRemains: 0,
              availabilityTotal: 5,
            }),
            { className: 'StarGiftUnique', id: 4n },
          ],
        }
      : { className: 'payments.StarGiftsNotModified' };
  });
  const first = await giftCatalogue();
  assert.deepEqual(
    first.gifts.map((g) => [g.id, g.stars, g.limited, g.soldOut, g.remains]),
    [
      ['1', 15, false, false, null],
      ['2', 100, true, false, 3],
      ['3', 50, true, true, 0],
    ]
  );
  assert.equal(first.gifts[0].sticker.id, '1');
  assert.equal(log[0].hash, 0);
  const again = await giftCatalogue();
  assert.deepEqual(again.gifts, first.gifts, 'unchanged: the kept list');
  assert.equal(log[1].hash, 77, 'asked with the hash of the answer');
  assert.deepEqual(
    catalogueOrder(first.gifts).map((g) => g.id),
    ['1', '2', '3']
  );
  assert.equal(giftCard(gift(5, 1), () => null).sticker, null);
});

const form = (price) => ({
  formId: 99n,
  invoice: { prices: [{ amount: BigInt(price) }] },
});
const sendRequest = {
  chat: '9',
  gift: '2',
  stars: 100,
  text: 'Hi!',
  hideName: true,
};

test('giftSend: checks, reads the form, pays only at the shown price', async () => {
  const { giftSend, log } = makeGift((r) => {
    if (r.className === 'CheckCanSendGift') {
      return { className: 'payments.CheckCanSendGiftResultOk' };
    }
    return r.className === 'GetPaymentForm'
      ? form(100)
      : { className: 'payments.PaymentResult' };
  });
  assert.deepEqual(await giftSend(sendRequest), { ok: true, paid: 100 });
  assert.deepEqual(
    log.map((r) => r.className),
    ['CheckCanSendGift', 'GetPaymentForm', 'SendStarsForm']
  );
  const invoice = log[1].invoice;
  assert.equal(invoice.className, 'InputInvoiceStarGift');
  assert.equal(invoice.giftId, 2n);
  assert.equal(invoice.hideName, true);
  assert.equal(invoice.message.text, 'Hi!');
  assert.equal(log[2].formId, 99n);
});

test('giftSend: a form whose price differs is refused, nothing is paid', async () => {
  const { giftSend, log } = makeGift((r) =>
    r.className === 'GetPaymentForm'
      ? form(120)
      : { className: 'payments.CheckCanSendGiftResultOk' }
  );
  const answer = await giftSend(sendRequest);
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'price');
  assert.ok(
    !log.some((r) => r.className === 'SendStarsForm'),
    'no payment was sent'
  );
});

test('giftSend: a person who takes no gifts, a low balance, a sold-out gift, bad requests', async () => {
  const closed = makeGift(() => ({
    className: 'payments.CheckCanSendGiftResultFail',
    reason: { text: 'Not for this one' },
  }));
  const refused = await closed.giftSend(sendRequest);
  assert.deepEqual(
    [refused.code, refused.error],
    ['cannot', 'Not for this one']
  );
  assert.equal(closed.log.length, 1);
  for (const [error, code] of [
    ['BALANCE_TOO_LOW', 'balance'],
    ['STARGIFT_USAGE_LIMITED', 'sold-out'],
    ['USER_PRIVACY_RESTRICTED', 'privacy'],
  ]) {
    const poor = makeGift((r) => {
      if (r.className === 'GetPaymentForm') {
        return form(100);
      }
      return r.className === 'SendStarsForm'
        ? telegramError(error)
        : { className: 'payments.CheckCanSendGiftResultOk' };
    });
    assert.equal((await poor.giftSend(sendRequest)).code, code);
  }
  const { giftSend, log } = makeGift(() => ({}));
  for (const wrong of [
    { ...sendRequest, stars: 0 },
    { ...sendRequest, chat: '-1005' },
    { ...sendRequest, gift: 'x' },
    { ...sendRequest, text: 'a'.repeat(256) },
    { ...sendRequest, hideName: 'yes' },
  ]) {
    assert.equal((await giftSend(wrong)).code, 'failed');
  }
  assert.equal(log.length, 0);
  assert.equal(giftText('  hi  '), 'hi');
});

// ---- routes and helpers -----------------------------------------------------

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
    ['profile-stories', { chat: '-1005' }],
    ['profile-stories', { chat: '5', album: 2, offset: 30 }],
    ['stories-archive', {}],
    ['story-pin', { chat: '5', ids: [1, 2], pinned: true }],
    ['story-pin-top', { chat: '5', ids: [] }],
    ['saved-music', { chat: '5', offset: 30 }],
    ['music-save', { chat: '5', message: 3 }],
    ['music-remove', { id: '123' }],
    ['gift-catalogue', {}],
    ['gift-send', sendRequest],
  ];
  for (const [route, body] of ok) {
    assert.equal((await post(route, body, account)).status, 200, route);
  }
  const bad = [
    ['profile-stories', { chat: 'x' }],
    ['profile-stories', { chat: '5', album: 0 }],
    ['profile-stories', { chat: '5', offset: -1 }],
    ['stories-archive', { offset: 'a' }],
    ['story-pin', { chat: '5', ids: [], pinned: true }],
    ['story-pin', { chat: '5', ids: [1] }],
    ['story-pin-top', { chat: '5', ids: [1, 2, 3, 4] }],
    ['story-pin-top', { chat: '5', ids: ['1'] }],
    ['saved-music', { chat: '5', offset: 1.5 }],
    ['music-save', { chat: '5', message: 0 }],
    ['music-remove', { id: '../x' }],
    ['gift-catalogue', { fresh: 'yes' }],
    ['gift-send', { ...sendRequest, stars: 0 }],
    ['gift-send', { ...sendRequest, chat: '-1005' }],
    ['gift-send', { ...sendRequest, gift: 'a' }],
    ['gift-send', { ...sendRequest, text: 'a'.repeat(256) }],
  ];
  const before = calls.length;
  for (const [route, body] of bad) {
    assert.equal((await post(route, body, account)).status, 400, route);
  }
  assert.equal(calls.length, before, 'no bad body was passed on');
});

test('page helpers: top stories first, the ids on top', () => {
  const stories = [
    { id: 1 },
    { id: 2, top: true },
    { id: 3 },
    { id: 4, top: true },
  ];
  assert.deepEqual(
    storiesInOrder(stories).map((s) => s.id),
    [2, 4, 1, 3]
  );
  assert.deepEqual(topIds(stories), [2, 4]);
});

test('the Api names used all exist in layer 225', async () => {
  const tl = await readFile(
    new URL('../src/sources/telegram-api/layer-232.tl', import.meta.url),
    'utf8'
  );
  for (const name of [
    'stories.getPinnedStories#',
    'stories.getAlbumStories#',
    'stories.getAlbums#',
    'stories.getStoriesArchive#',
    'stories.togglePinned#',
    'stories.togglePinnedToTop#',
    'users.getSavedMusic#',
    'account.saveMusic#',
    'payments.getStarGifts#',
    'payments.checkCanSendGift#',
    'payments.getPaymentForm#',
    'payments.sendStarsForm#',
    'inputInvoiceStarGift#',
    'inputUserSelf#',
  ]) {
    assert.ok(tl.includes(name), name);
  }
});
