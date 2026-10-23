// Giveaways (R-Y184): the cards from Telegram's giveaway media, the lines
// about giveaways and paid messages in a chat, payments.getGiveawayInfo's
// two answers, names of ids, and the route's validation. Read only. Fake
// clients; nothing reaches a network, and no test depends on today's date.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_NAMES,
  createGiveaways,
  infoOf,
  validIds,
} from '../src/sources/telegram-giveaways.js';
import {
  audienceWords,
  channelChat,
  countryName,
  dateText,
  giveawayOf,
  giveawayResultsOf,
  prizeWords,
  serviceWords,
} from '../src/web/giveaway-model.js';
import { parseMessageParts, serviceInfo } from '../src/web/message-parts.js';
import { translate } from '../src/web/i18n.js';
import {
  SETTING_KEYS,
  createChatSettings,
  settingsInfo,
  validSetting,
} from '../src/sources/telegram-chat-settings.js';
import { paidStarsOf, settingValue } from '../src/web/chat-settings.js';
import { named } from './helpers/telegram-fakes.mjs';

const MEDIA = {
  className: 'MessageMediaGiveaway',
  channels: [{ value: 1234n }, '5678'],
  quantity: 5,
  months: 3,
  prizeDescription: 'and a mug',
  countriesIso2: ['DE', 'fr', 'bad'],
  onlyNewSubscribers: true,
  winnersAreVisible: true,
  untilDate: 1_800_000_000,
};

test('a running giveaway becomes a card', () => {
  const card = giveawayOf(MEDIA);
  assert.equal(card.kind, 'giveaway');
  assert.deepEqual(card.channels, ['1234', '5678']);
  assert.deepEqual(card.countries, ['DE', 'fr']);
  assert.equal(card.winners, 5);
  assert.equal(card.months, 3);
  assert.equal(card.stars, 0);
  assert.equal(card.description, 'and a mug');
  assert.equal(card.onlyNew, true);
  assert.equal(card.until, 1_800_000_000);
  const stars = giveawayOf({ ...MEDIA, months: undefined, stars: 500n });
  assert.equal(stars.stars, 500);
  assert.equal(stars.months, 0);
});

test('a finished giveaway becomes a results card', () => {
  const card = giveawayResultsOf({
    className: 'MessageMediaGiveawayResults',
    channelId: { value: 99n },
    launchMsgId: 12,
    winnersCount: 4,
    unclaimedCount: 1,
    winners: [10n, { value: 11n }],
    stars: 200n,
    refunded: false,
    untilDate: 1_800_000_100,
  });
  assert.equal(card.kind, 'giveaway-results');
  assert.equal(card.channel, '99');
  assert.equal(channelChat(card.channel), '-10099');
  assert.equal(card.launchId, 12);
  assert.deepEqual(card.winners, ['10', '11']);
  assert.equal(card.unclaimed, 1);
  assert.equal(card.stars, 200);
});

test('both are media the message parts know', () => {
  const link = (media) => ({
    id: 'msg:telegram:-100:1',
    chat: '-100',
    raw: { id: 1, media, message: '' },
  });
  assert.equal(parseMessageParts(link(MEDIA)).media.kind, 'giveaway');
  assert.equal(
    parseMessageParts(
      link({ className: 'MessageMediaGiveawayResults', winnersCount: 2 })
    ).media.kind,
    'giveaway-results'
  );
});

test('prize and audience wording', () => {
  assert.deepEqual(prizeWords({ stars: 0, months: 6, winners: 3 }), {
    key: 'chat.giveaway.prizeMonths',
    params: { count: 3, months: 6 },
  });
  assert.deepEqual(prizeWords({ stars: 50, months: 0, winners: 3 }), {
    key: 'chat.giveaway.prizeStars',
    params: { count: 50 },
  });
  assert.equal(
    audienceWords({ channels: ['1'], onlyNew: false }).key,
    'chat.giveaway.audienceAllOne'
  );
  assert.equal(
    audienceWords({ channels: ['1'], onlyNew: true }).key,
    'chat.giveaway.audienceNewOne'
  );
  assert.deepEqual(audienceWords({ channels: ['1', '2'], onlyNew: false }), {
    key: 'chat.giveaway.audienceAllMany',
    params: { count: 2 },
  });
});

test('dates and countries are written in the locale, from a given time', () => {
  assert.equal(dateText(0, 'en'), '');
  const text = dateText(1_800_000_000, 'en');
  assert.match(text, /2027/);
  assert.notEqual(dateText(1_800_000_000, 'ru'), '');
  assert.equal(countryName('DE', 'en'), 'Germany');
  assert.equal(countryName('DE', 'ru'), 'Германия');
});

test('the lines about giveaways and paid messages carry their numbers', () => {
  assert.equal(
    serviceWords('MessageActionGiveawayLaunch', {}).key,
    'chat.service.giveawayLaunch'
  );
  assert.deepEqual(
    serviceWords('MessageActionGiveawayResults', {
      winnersCount: 3,
      unclaimedCount: 0,
    }),
    {
      key: 'chat.service.giveawayResults',
      params: { count: 3, unclaimed: 0 },
    }
  );
  assert.equal(
    serviceWords('MessageActionGiveawayResults', {
      winnersCount: 3,
      unclaimedCount: 1,
    }).key,
    'chat.service.giveawayResultsUnclaimed'
  );
  assert.deepEqual(
    serviceWords('MessageActionPaidMessagesPrice', { stars: 12n }),
    { key: 'chat.service.paidPrice', params: { count: 12 } }
  );
  assert.equal(
    serviceWords('MessageActionPaidMessagesPrice', { stars: 0 }).key,
    'chat.service.paidPriceOff'
  );
  assert.deepEqual(
    serviceWords('MessageActionPaidMessagesRefunded', { count: 2, stars: 20 })
      .params,
    { count: 2, stars: 20 }
  );
  assert.equal(serviceWords('MessageActionPinMessage', {}), null);
  const info = serviceInfo({
    service: 'MessageActionPaidMessagesPrice',
    raw: { action: { stars: 7 } },
  });
  assert.equal(info.key, 'chat.service.paidPrice');
  assert.equal(
    translate('en', info.key, info.params),
    'Each message here now costs 7 ⭐'
  );
  assert.match(
    translate('ru', 'chat.service.giveawayResults', { count: 2 }),
    /2 победителя/
  );
});

// ---- payments.getGiveawayInfo ---------------------------------------------

test('a running giveaway: taking part, or why not', () => {
  assert.deepEqual(
    infoOf({
      className: 'payments.GiveawayInfo',
      participating: true,
      startDate: 5,
    }),
    { ended: false, participating: true, preparing: false, startDate: 5 }
  );
  const early = infoOf({
    className: 'payments.GiveawayInfo',
    joinedTooEarlyDate: 3,
    startDate: 5,
  });
  assert.equal(early.joinedTooEarlyDate, 3);
  assert.equal(early.participating, false);
  assert.equal(
    infoOf({ adminDisallowedChatId: { value: 77n }, startDate: 1 })
      .disallowedChat,
    '-10077'
  );
  assert.equal(
    infoOf({ disallowedCountry: 'RU', startDate: 1 }).disallowedCountry,
    'RU'
  );
  assert.equal(
    infoOf({ preparingResults: true, startDate: 1 }).preparing,
    true
  );
});

test('a finished giveaway: won, lost, refunded, claimed', () => {
  const won = infoOf({
    className: 'payments.GiveawayInfoResults',
    winner: true,
    startDate: 1,
    finishDate: 2,
    winnersCount: 10,
    activatedCount: 4,
    giftCodeSlug: 'abc123',
  });
  assert.deepEqual(won, {
    ended: true,
    winner: true,
    refunded: false,
    startDate: 1,
    finishDate: 2,
    winnersCount: 10,
    activatedCount: 4,
    slug: 'abc123',
  });
  const lost = infoOf({
    className: 'GiveawayInfoResults',
    refunded: true,
    startDate: 1,
    finishDate: 2,
    winnersCount: 3,
    starsPrize: 90n,
  });
  assert.equal(lost.winner, false);
  assert.equal(lost.refunded, true);
  assert.equal(lost.starsPrize, 90);
  assert.equal('slug' in lost, false);
});

const Api = {
  payments: { GetGiveawayInfo: named('payments.GetGiveawayInfo') },
  channels: { GetChannels: named('channels.GetChannels') },
  users: { GetUsers: named('users.GetUsers') },
};

const makeGiveaways = (answer, known = {}) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    peers: { input: async (chat) => known[chat] ?? null },
  };
  return {
    actions: createGiveaways(env, { userClient: async () => client }),
    log,
  };
};

test('the details are asked of Telegram for that message only, read only', async () => {
  const { actions, log } = makeGiveaways(
    (request) => {
      switch (request.className) {
        case 'payments.GetGiveawayInfo':
          return {
            className: 'payments.GiveawayInfo',
            participating: true,
            startDate: 9,
          };
        case 'channels.GetChannels':
          return { chats: [{ title: 'News' }] };
        default:
          return [{ firstName: 'Ann', lastName: 'Lee' }];
      }
    },
    { '-1001234': 'in1', 10: 'in2' }
  );
  const out = await actions.giveawayInfo({
    chat: '-100999',
    id: 7,
    channels: ['1234', '55'],
    winners: ['10', '11'],
  });
  assert.equal(out.ok, true);
  assert.equal(out.participating, true);
  // Names only for ids we can reach; the rest are left out, no failure.
  assert.deepEqual(out.channelNames, [{ id: '1234', name: 'News' }]);
  assert.deepEqual(out.winnerNames, [{ id: '10', name: 'Ann Lee' }]);
  const asked = log.find((r) => r.className === 'payments.GetGiveawayInfo');
  assert.equal(asked.msgId, 7);
  assert.equal(asked.peer.chat, '-100999');
  // Nothing but reads.
  assert.ok(
    log.every((r) => /Get/.test(r.className)),
    log.map((r) => r.className).join()
  );
});

test("Telegram's errors become codes, bad input asks nothing", async () => {
  const gone = makeGiveaways(() =>
    Object.assign(new Error('x'), { errorMessage: 'MESSAGE_ID_INVALID' })
  );
  assert.equal(
    (await gone.actions.giveawayInfo({ chat: '-100999', id: 7 })).code,
    'no-message'
  );
  const idle = makeGiveaways(() => assert.fail('no request'));
  for (const bad of [
    { chat: 'x', id: 7 },
    { chat: '-100999', id: 0 },
    { chat: '-100999', id: 1.5 },
    { chat: '-100999', id: 7, channels: ['a'] },
    { chat: '-100999', id: 7, winners: Array(MAX_NAMES + 1).fill('1') },
  ]) {
    assert.equal((await idle.actions.giveawayInfo(bad)).code, 'bad-request');
  }
  assert.equal(idle.log.length, 0);
  assert.equal(validIds(undefined) && validIds(['1', 2]), true);
});

// ---- channel auto-translation, in the channel's settings --------------------

test('the owner of a channel may switch auto-translation; nobody else', () => {
  const owner = settingsInfo({
    creator: true,
    broadcast: true,
    autotranslation: true,
  });
  assert.ok(owner.shown.includes('autotranslation'));
  assert.equal(owner.values.autotranslation, true);
  const admin = settingsInfo({
    adminRights: { changeInfo: true },
    broadcast: true,
  });
  assert.equal(admin.shown.includes('autotranslation'), false);
  const group = settingsInfo({ creator: true, megagroup: true });
  assert.equal(group.shown.includes('autotranslation'), false);
  assert.equal(SETTING_KEYS.includes('autotranslation'), true);
  assert.equal(
    validSetting({ chat: '-1001', setting: 'autotranslation', value: true }),
    true
  );
  assert.equal(
    validSetting({ chat: '-5', setting: 'autotranslation', value: true }),
    false
  );
});

test('the toggle is channels.toggleAutotranslation, sent on the click only', async () => {
  const log = [];
  const ToggleAutotranslation = named('channels.ToggleAutotranslation');
  const env = {
    importer: async () => ({
      Api: { channels: { ToggleAutotranslation } },
      helpers: { returnBigInt: BigInt },
    }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const { chatSettingSet } = createChatSettings(env, {
    userClient: async () => ({
      invoke: async (request) => {
        log.push(request);
        return true;
      },
    }),
  });
  assert.equal(log.length, 0);
  assert.deepEqual(
    await chatSettingSet({
      chat: '-1001',
      setting: 'autotranslation',
      value: true,
    }),
    { ok: true }
  );
  assert.equal(log[0].className, 'channels.ToggleAutotranslation');
  assert.equal(log[0].enabled, true);
  assert.equal(log[0].channel.chat, '-1001');
});

test('a supergroup admin sees the price only where Telegram offers paid messages', () => {
  const entity = { megagroup: true, adminRights: { changeInfo: true } };
  const on = settingsInfo(entity, {
    paidMessagesAvailable: true,
    sendPaidMessagesStars: 9n,
  });
  assert.ok(on.shown.includes('paidMessages'));
  assert.equal(on.paidStars, 9);
  assert.equal(settingsInfo(entity, {}).shown.includes('paidMessages'), false);
  assert.equal(
    settingsInfo(
      { megagroup: true },
      { paidMessagesAvailable: true }
    ).shown.includes('paidMessages'),
    false
  );
  // The page believes what it just saved, then the chat's info.
  assert.equal(paidStarsOf('-1001', { settings: on }), 9);
  assert.equal(
    settingValue('-1001', { settings: owner() }, 'autotranslation'),
    true
  );
});

const owner = () =>
  settingsInfo({ creator: true, broadcast: true, autotranslation: true });
