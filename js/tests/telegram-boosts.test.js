// Channel boosts (R-Y173): the status, the user's slots, applying one slot,
// the boosters list, the routes' validation and the page's pure helpers
// (progress, which slot a click on Boost uses). Fake clients; nothing
// reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoosts } from '../src/sources/telegram-boosts.js';
import {
  canSeeBoosters,
  pickSlot,
  progressOf,
} from '../src/web/chat-boosts.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  premium: {
    GetBoostsStatus: named('GetBoostsStatus'),
    GetMyBoosts: named('GetMyBoosts'),
    ApplyBoost: named('ApplyBoost'),
    GetBoostsList: named('GetBoostsList'),
  },
};

const make = (answer, premium = true) => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const client = {
    ...fakeClient(answer, log),
    getMe: async () => ({ premium }),
  };
  return { ...createBoosts(env, { userClient: async () => client }), log };
};

const CHAT = '-1005';
const myBoosts = {
  myBoosts: [
    {
      slot: 1,
      peer: { className: 'PeerChannel', channelId: 5n },
      expires: 900,
      cooldownUntilDate: 700,
    },
    { slot: 2, expires: 900 },
  ],
  chats: [{ id: 5n, title: 'Fake Channel' }],
};

test('boostsStatus: level, progress figures and link', async () => {
  const { boostsStatus, log } = make(() => ({
    level: 2,
    boosts: 5,
    currentLevelBoosts: 3,
    nextLevelBoosts: 8,
    boostUrl: 'https://t.me/c/5?boost',
    myBoost: true,
  }));
  assert.deepEqual(await boostsStatus({ chat: CHAT }), {
    ok: true,
    level: 2,
    boosts: 5,
    giftBoosts: 0,
    currentLevelBoosts: 3,
    nextLevelBoosts: 8,
    url: 'https://t.me/c/5?boost',
    mine: true,
  });
  assert.equal(log[0].className, 'GetBoostsStatus');
  assert.deepEqual(log[0].peer, { chat: CHAT });
  assert.equal((await boostsStatus({ chat: '5' })).code, 'failed');
  const top = make(() => ({ level: 9, boosts: 99, boostUrl: 'u' }));
  assert.equal((await top.boostsStatus({ chat: CHAT })).nextLevelBoosts, null);
});

test('myBoosts: slots with their chat and Premium', async () => {
  const { myBoosts: read, log } = make(() => myBoosts);
  const answer = await read({ chat: CHAT });
  assert.equal(answer.premium, true);
  assert.deepEqual(answer.slots, [
    {
      slot: 1,
      chat: '-1005',
      title: 'Fake Channel',
      expires: 900,
      cooldownUntil: 700,
    },
    { slot: 2, chat: null, title: '', expires: 900, cooldownUntil: 0 },
  ]);
  assert.equal(log[0].className, 'GetMyBoosts');
  assert.equal(
    (await make(() => myBoosts, false).myBoosts({ chat: CHAT })).premium,
    false
  );
});

test('boostApply: one slot, a write; errors become codes', async () => {
  const { boostApply, log } = make(() => myBoosts);
  const answer = await boostApply({ chat: CHAT, slot: 2 });
  assert.equal(answer.ok, true);
  assert.equal(log[0].className, 'ApplyBoost');
  assert.deepEqual(log[0].slots, [2]);
  assert.deepEqual(log[0].peer, { chat: CHAT });
  assert.equal((await boostApply({ chat: CHAT, slot: 0 })).code, 'failed');
  assert.equal((await boostApply({ chat: CHAT })).code, 'failed');
  assert.equal(log.length, 1, 'the bad ones were not sent');
  const locked = make(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal(
    (await locked.boostApply({ chat: CHAT, slot: 1 })).code,
    'premium'
  );
  const same = make(() => telegramError('BOOST_NOT_MODIFIED'));
  assert.equal(
    (await same.boostApply({ chat: CHAT, slot: 1 })).code,
    'already'
  );
});

test('boostersList: names, dates, multipliers and the next page', async () => {
  const { boostersList, log } = make(() => ({
    count: 3,
    nextOffset: 'o2',
    boosts: [
      { userId: 7n, date: 10, expires: 20, multiplier: 2 },
      { date: 11, expires: 21, giveaway: true },
    ],
    users: [{ id: 7n, firstName: 'Ann', lastName: 'Lee' }],
  }));
  const answer = await boostersList({ chat: CHAT, offset: 'o1' });
  assert.equal(answer.count, 3);
  assert.equal(answer.next, 'o2');
  assert.deepEqual(answer.boosters[0], {
    user: '7',
    name: 'Ann Lee',
    date: 10,
    expires: 20,
    multiplier: 2,
    gift: false,
    giveaway: false,
  });
  assert.equal(answer.boosters[1].user, null);
  assert.equal(answer.boosters[1].giveaway, true);
  assert.equal(log[0].offset, 'o1');
  assert.equal(log[0].limit, 50);
  const denied = make(() => telegramError('CHAT_ADMIN_REQUIRED'));
  assert.equal((await denied.boostersList({ chat: CHAT })).code, 'admin');
});

test('the routes check their bodies before asking the account', async () => {
  const calls = [];
  const remember = (name) => async (r) => (calls.push([name, r]), { ok: true });
  const account = {
    boostsStatus: remember('status'),
    myBoosts: remember('mine'),
    boostApply: remember('apply'),
    boostersList: remember('list'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('boosts-status', { chat: CHAT }), 200);
  assert.equal(await status('boosts-status', { chat: '5' }), 400);
  assert.equal(await status('my-boosts', { chat: CHAT }), 200);
  assert.equal(await status('boost-apply', { chat: CHAT, slot: 1 }), 200);
  assert.equal(await status('boost-apply', { chat: CHAT, slot: '1' }), 400);
  assert.equal(await status('boost-apply', { chat: CHAT }), 400);
  assert.equal(await status('boosters', { chat: CHAT }), 200);
  assert.equal(await status('boosters', { chat: CHAT, offset: 5 }), 400);
  assert.equal(calls.length, 4);
});

test('progressOf: share of the way to the next level, none at the top', () => {
  assert.deepEqual(
    progressOf({ boosts: 5, currentLevelBoosts: 3, nextLevelBoosts: 7 }),
    { have: 5, need: 7, percent: 50 }
  );
  assert.equal(
    progressOf({ boosts: 5, currentLevelBoosts: 3, nextLevelBoosts: null }),
    null
  );
  assert.equal(progressOf(null), null);
});

test('pickSlot: free first, then ask before moving a used or cooling slot', () => {
  const now = 1000;
  const free = { slot: 2, chat: null, expires: 5000, cooldownUntil: 0 };
  const used = {
    slot: 1,
    chat: '-1009',
    title: 'Other',
    expires: 5000,
    cooldownUntil: 0,
  };
  const cooling = {
    slot: 3,
    chat: '-1008',
    title: 'Cold',
    expires: 5000,
    cooldownUntil: 2000,
  };
  const mine = {
    slot: 4,
    chat: CHAT,
    title: 'Here',
    expires: 5000,
    cooldownUntil: 0,
  };
  assert.deepEqual(pickSlot([used, free], CHAT, now), {
    kind: 'free',
    slot: 2,
  });
  assert.deepEqual(pickSlot([cooling, used], CHAT, now), {
    kind: 'ask',
    slot: 1,
    from: 'Other',
    cooldownUntil: 0,
  });
  assert.deepEqual(pickSlot([cooling], CHAT, now), {
    kind: 'ask',
    slot: 3,
    from: 'Cold',
    cooldownUntil: 2000,
  });
  assert.equal(pickSlot([mine], CHAT, now).kind, 'already');
  assert.equal(pickSlot([], CHAT, now).kind, 'none');
  assert.equal(pickSlot([{ ...free, expires: 500 }], CHAT, now).kind, 'none');
});

test('canSeeBoosters: admins with the reader only', () => {
  const api = { telegramBoosters: () => {} };
  assert.equal(canSeeBoosters({ canViewStats: true }, api), true);
  assert.equal(canSeeBoosters({ canEdit: true }, api), true);
  assert.equal(canSeeBoosters({}, api), false);
  assert.equal(canSeeBoosters({ canEdit: true }, {}), false);
});
