// Telegram Business (R-Y180): opening hours, location, intro, a person's
// business profile, chat links, the connected bot, folder tags; the
// routes' strict bodies; the page's pure helpers (hours in days and in
// another time zone, links, tags). Fake clients; nothing reaches a network.
// Whatever depends on the time takes the clock as an argument.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createBusiness,
  validWeekly,
} from '../src/sources/telegram-business.js';
import { createBusinessLinks } from '../src/sources/telegram-business-links.js';
import {
  createBusinessBots,
  barOf,
} from '../src/sources/telegram-business-bots.js';
import { createFolders, folderOf } from '../src/sources/telegram-folders.js';
import { validFolder } from '../src/sources/telegram-folder-edit.js';
import {
  daysProblem,
  hoursIn,
  isOpen,
  offsetMinutes,
  parseTime,
  rangesText,
  shiftWeekly,
  toDays,
  toWeekly,
  weekMinute,
  weekday,
} from '../src/web/business-hours-model.js';
import { hoursView } from '../src/web/chat-business-profile.js';
import { startDays } from '../src/web/chat-business-hours.js';
import { coordinate, locationRequest } from '../src/web/chat-business-place.js';
import { businessSlugOf } from '../src/web/chat-business-link-open.js';
import { linkLabel, linkProblem } from '../src/web/chat-business-links.js';
import {
  botForm,
  botProblem,
  botUsername,
} from '../src/web/chat-business-bots.js';
import { isTag, draftOf, requestOf } from '../src/web/chat-folder-model.js';
import { tagMap } from '../src/web/chat-folder-tags.js';
import {
  named,
  helpers,
  telegramError,
  post,
} from './helpers/telegram-fakes.mjs';

const NAMES = {
  '': ['InputUserSelf', 'InputUser', 'InputGeoPoint', 'InputDocument'],
};

test('an absent, null or zero Telegram Business bot never produces a managing banner', () => {
  for (const businessBotId of [undefined, null, 0, 0n, '0', 'null']) {
    assert.equal(barOf({ businessBotId }, []), null);
  }
  assert.equal(barOf({ businessBotId: 500n }, []).id, '500');
});
const apiOf = (spec) => {
  const Api = {};
  for (const name of NAMES['']) {
    Api[name] = named(name);
  }
  for (const [space, list] of Object.entries(spec)) {
    Api[space] = Object.fromEntries(list.map((n) => [n, named(n)]));
  }
  for (const n of [
    'BusinessWorkHours',
    'BusinessWeeklyOpen',
    'InputBusinessIntro',
    'InputBusinessChatLink',
    'InputBusinessBotRecipients',
    'BusinessBotRights',
  ]) {
    Api[n] = named(n);
  }
  return Api;
};

const Api = apiOf({
  users: ['GetFullUser'],
  help: ['GetTimezonesList'],
  messages: ['GetStickers', 'ToggleDialogFilterTags', 'GetPeerSettings'],
  contacts: ['ResolveUsername'],
  account: [
    'UpdateBusinessWorkHours',
    'UpdateBusinessLocation',
    'UpdateBusinessIntro',
    'GetBusinessChatLinks',
    'CreateBusinessChatLink',
    'EditBusinessChatLink',
    'DeleteBusinessChatLink',
    'ResolveBusinessChatLink',
    'GetConnectedBots',
    'UpdateConnectedBot',
    'ToggleConnectedBotPaused',
    'DisablePeerConnectedBot',
  ],
});

const make = (create, answer, stickers) => {
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
    getInputEntity: async (id) => ({ userId: BigInt(id), accessHash: 9n }),
  };
  const actions = create(
    {
      importer: async () => ({ Api, helpers }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ userId: BigInt(chat), accessHash: 5n }),
      },
    },
    { userClient: async () => client, stickers }
  );
  return { actions, log };
};

const document = (id) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: 4n,
  fileReference: 'ref',
  attributes: [],
});

const WORK = {
  className: 'BusinessWorkHours',
  timezoneId: 'Europe/Berlin',
  openNow: true,
  weeklyOpen: [
    { startMinute: 540, endMinute: 1080 },
    { startMinute: 1980, endMinute: 2520 },
  ],
};

test('hours: read with the time zones; written only by hoursSet', async () => {
  const { actions, log } = make(createBusiness, (r) =>
    r.className === 'GetFullUser'
      ? { fullUser: { businessWorkHours: WORK } }
      : {
          timezones: [{ id: 'Europe/Berlin', name: 'Berlin', utcOffset: 3600 }],
        }
  );
  const got = await actions.businessHours();
  assert.deepEqual(got.hours, {
    timezone: 'Europe/Berlin',
    weekly: [
      { start: 540, end: 1080 },
      { start: 1980, end: 2520 },
    ],
    openNow: true,
  });
  assert.deepEqual(got.timezones, [
    { id: 'Europe/Berlin', name: 'Berlin', offset: 3600 },
  ]);
  assert.deepEqual(
    log.map((r) => r.className),
    ['GetFullUser', 'GetTimezonesList']
  );
  assert.equal(log[0].id.className, 'InputUserSelf');
});

test('hoursSet sends the weekly list; none clears; bad lists never leave', async () => {
  const { actions, log } = make(createBusiness, () => true);
  assert.equal(
    (
      await actions.businessHoursSet({
        timezone: 'Asia/Tokyo',
        weekly: [{ start: 0, end: 600 }],
      })
    ).ok,
    true
  );
  const sent = log[0];
  assert.equal(sent.className, 'UpdateBusinessWorkHours');
  assert.equal(sent.businessWorkHours.timezoneId, 'Asia/Tokyo');
  assert.equal(sent.businessWorkHours.weeklyOpen[0].endMinute, 600);
  await actions.businessHoursSet({ timezone: 'Asia/Tokyo', weekly: [] });
  assert.equal(log[1].businessWorkHours, undefined, 'cleared');
  const before = log.length;
  for (const weekly of [
    [{ start: 10, end: 5 }],
    [
      { start: 0, end: 100 },
      { start: 50, end: 200 },
    ],
    [{ start: 0, end: 99_999 }],
    'x',
  ]) {
    const refused = await actions.businessHoursSet({
      timezone: 'Asia/Tokyo',
      weekly,
    });
    assert.equal(refused.code, 'hours-invalid');
  }
  assert.equal(
    (await actions.businessHoursSet({ timezone: '../x', weekly: [] })).ok,
    false
  );
  assert.equal(log.length, before, 'nothing asked');
});

test('validWeekly: a last interval into Monday must not meet Monday', () => {
  assert.equal(validWeekly([{ start: 10_000, end: 10_200 }]), true);
  assert.equal(
    validWeekly([
      { start: 100, end: 200 },
      { start: 10_000, end: 10_200 },
    ]),
    false
  );
});

test('Premium refusals become the premium code', async () => {
  const { actions } = make(createBusiness, () =>
    telegramError('PREMIUM_ACCOUNT_REQUIRED')
  );
  const set = await actions.businessHoursSet({
    timezone: 'UTC',
    weekly: [{ start: 0, end: 60 }],
  });
  assert.equal(set.code, 'premium');
  assert.equal(
    (await actions.foldersTagsSet({ enabled: true })).code,
    'premium'
  );
});

test('location: read, set with a point, cleared, bad ones refused', async () => {
  const { actions, log } = make(createBusiness, (r) =>
    r.className === 'GetFullUser'
      ? {
          fullUser: {
            businessLocation: {
              address: 'Main St 1',
              geoPoint: { className: 'GeoPoint', lat: 52.5, long: 13.4 },
            },
          },
        }
      : true
  );
  assert.deepEqual((await actions.businessLocation()).location, {
    address: 'Main St 1',
    point: { lat: 52.5, lon: 13.4 },
  });
  await actions.businessLocationSet({ address: ' Main St 2 ', lat: 1, lon: 2 });
  assert.equal(log[1].address, 'Main St 2');
  assert.equal(log[1].geoPoint.className, 'InputGeoPoint');
  assert.deepEqual([log[1].geoPoint.lat, log[1].geoPoint.long], [1, 2]);
  await actions.businessLocationSet({ address: '' });
  assert.equal(log[2].address, undefined);
  assert.equal(log[2].geoPoint, undefined);
  for (const bad of [
    { address: 'x', lat: 91, lon: 0 },
    { address: 'x', lat: 1 },
    { address: '', lat: 1, lon: 2 },
    { address: 'y'.repeat(97) },
    {},
  ]) {
    assert.equal((await actions.businessLocationSet(bad)).ok, false);
  }
  assert.equal(log.length, 3);
});

test('intro: the sticker is remembered; a chosen one is sent as an input document', async () => {
  const remembered = [];
  const stickers = {
    remember: (docs, from) => {
      remembered.push(from);
      return docs.map((d) => ({ id: String(d.id), kind: 'sticker' }));
    },
    onAgain: () => {},
  };
  const { actions, log } = make(
    createBusiness,
    (r) => {
      if (r.className === 'GetFullUser') {
        return {
          fullUser: {
            businessIntro: {
              title: 'Hi',
              description: 'Welcome',
              sticker: document(11),
            },
          },
        };
      }
      return r.className === 'GetStickers'
        ? { stickers: [document(21), document(22)] }
        : true;
    },
    stickers
  );
  const intro = (await actions.businessIntro()).intro;
  assert.equal(intro.title, 'Hi');
  assert.equal(intro.sticker.id, '11');
  const choices = await actions.businessIntroStickers();
  assert.deepEqual(
    choices.stickers.map((s) => s.id),
    ['21', '22']
  );
  assert.equal(log.at(-1).emoticon, '\u{1F44B}');
  await actions.businessIntroSet({
    title: 'Hello',
    description: 'There',
    sticker: '22',
  });
  const sent = log.at(-1);
  assert.equal(sent.intro.title, 'Hello');
  assert.equal(sent.intro.sticker.className, 'InputDocument');
  assert.equal(sent.intro.sticker.id, 22n);
  const asked = log.length;
  assert.equal(
    (
      await actions.businessIntroSet({
        title: '',
        description: '',
        sticker: '99',
      })
    ).code,
    'unknown-sticker'
  );
  assert.equal(log.length, asked, 'an unknown sticker is never sent');
  await actions.businessIntroSet({
    title: ' ',
    description: '',
    sticker: null,
  });
  assert.equal(log.at(-1).intro, undefined, 'empty clears the intro');
  assert.equal(
    (
      await actions.businessIntroSet({
        title: 'x'.repeat(33),
        description: '',
      })
    ).code,
    'intro-long'
  );
  assert.ok(remembered.includes('business:me'));
});

test('businessProfile reads a person: hours, address, intro', async () => {
  const { actions, log } = make(createBusiness, () => ({
    fullUser: {
      businessWorkHours: WORK,
      businessLocation: {
        address: 'Here',
        geoPoint: { className: 'GeoPointEmpty' },
      },
      businessIntro: { title: 'T', description: 'D' },
    },
  }));
  const got = await actions.businessProfile({ chat: '42' });
  assert.equal(got.hours.timezone, 'Europe/Berlin');
  assert.deepEqual(got.location, { address: 'Here', point: null });
  assert.deepEqual(got.intro, { title: 'T', description: 'D', sticker: null });
  assert.equal(log[0].id.className, 'InputUser');
  assert.equal((await actions.businessProfile({ chat: '-100' })).ok, false);
});

test('folder tags: toggleDialogFilterTags with a boolean only', async () => {
  const { actions, log } = make(createBusiness, () => true);
  assert.deepEqual(await actions.foldersTagsSet({ enabled: true }), {
    ok: true,
    enabled: true,
  });
  assert.equal(log[0].enabled, true);
  assert.equal((await actions.foldersTagsSet({ enabled: 'yes' })).ok, false);
});

test('chat links: list, create, edit, delete, resolve', async () => {
  const { actions, log } = make(createBusinessLinks, (r) => {
    switch (r.className) {
      case 'GetBusinessChatLinks':
        return {
          links: [
            {
              link: 'https://t.me/m/AbC_1',
              message: 'Hello',
              title: 'Promo',
              views: 3,
            },
          ],
        };
      case 'ResolveBusinessChatLink':
        return {
          peer: { className: 'PeerUser', userId: 77n },
          message: 'Hi there',
          users: [{ id: 77n, firstName: 'Shop', lastName: 'Owner' }],
        };
      case 'DeleteBusinessChatLink':
        return true;
      default:
        return {
          link: 'https://t.me/m/NEW',
          message: r.link.message,
          title: r.link.title ?? '',
          views: 0,
        };
    }
  });
  assert.deepEqual((await actions.businessLinks()).links, [
    {
      slug: 'AbC_1',
      link: 'https://t.me/m/AbC_1',
      message: 'Hello',
      title: 'Promo',
      views: 3,
    },
  ]);
  const made = await actions.businessLinkCreate({
    message: 'Hi',
    title: ' Sale ',
  });
  assert.equal(made.link.slug, 'NEW');
  assert.equal(log.at(-1).link.title, 'Sale');
  await actions.businessLinkEdit({ slug: 'AbC_1', message: 'Changed' });
  assert.equal(log.at(-1).slug, 'AbC_1');
  assert.equal(log.at(-1).link.title, undefined);
  assert.equal((await actions.businessLinkDelete({ slug: 'AbC_1' })).ok, true);
  assert.deepEqual(await actions.businessLinkResolve({ slug: 'AbC_1' }), {
    ok: true,
    chat: '77',
    name: 'Shop Owner',
    text: 'Hi there',
  });
  const asked = log.length;
  for (const bad of [
    () => actions.businessLinkCreate({ message: '  ' }),
    () => actions.businessLinkCreate({ message: 'x', title: 'y'.repeat(33) }),
    () => actions.businessLinkEdit({ slug: 'a b', message: 'x' }),
    () => actions.businessLinkDelete({ slug: '' }),
    () => actions.businessLinkResolve({ slug: '../' }),
  ]) {
    assert.equal((await bad()).ok, false);
  }
  assert.equal(log.length, asked);
  const gone = make(createBusinessLinks, () =>
    telegramError('CHATLINK_SLUG_EXPIRED')
  );
  assert.equal(
    (await gone.actions.businessLinkResolve({ slug: 'x' })).code,
    'link-gone'
  );
});

const BOT = {
  className: 'ConnectedBot',
  botId: 500n,
  rights: { reply: true, editName: true },
  recipients: { existingChats: true, contacts: true, users: [31n] },
};

test('chatbot: read, connect a username keeping the rest, disconnect', async () => {
  let connectedBots = [BOT];
  const { actions, log } = make(createBusinessBots, (r) => {
    switch (r.className) {
      case 'GetConnectedBots':
        return {
          connectedBots,
          users: [
            {
              id: 500n,
              username: 'shop_bot',
              firstName: 'Shop Bot',
              bot: true,
            },
          ],
        };
      case 'ResolveUsername':
        return {
          peer: { userId: 600n },
          users: [{ id: 600n, accessHash: 3n, bot: true, username: 'new_bot' }],
        };
      default:
        return true;
    }
  });
  const bot = (await actions.businessBot()).bot;
  assert.equal(bot.username, 'shop_bot');
  assert.equal(bot.canReply, true);
  assert.deepEqual(bot.recipients.users, ['31']);
  // The same bot: its other rights and chosen people stay.
  const recipients = {
    existingChats: false,
    newChats: true,
    contacts: false,
    nonContacts: false,
  };
  await actions.businessBotSet({
    username: '@shop_bot',
    recipients,
    canReply: false,
  });
  const update = log.find((r) => r.className === 'UpdateConnectedBot');
  assert.equal(update.bot.userId, 500n);
  assert.equal(update.rights.reply, undefined);
  assert.equal(update.rights.editName, true);
  assert.equal(update.recipients.newChats, true);
  assert.equal(update.recipients.existingChats, undefined);
  assert.equal(update.recipients.users.length, 1);
  // Another bot: resolved by username, nothing kept.
  log.length = 0;
  await actions.businessBotSet({
    username: 'new_bot',
    recipients,
    canReply: true,
  });
  assert.ok(log.some((r) => r.className === 'ResolveUsername'));
  const other = log.find((r) => r.className === 'UpdateConnectedBot');
  assert.equal(other.bot.userId, 600n);
  assert.deepEqual(
    Object.keys(other.rights).filter((k) => k !== 'className'),
    ['reply']
  );
  assert.equal(other.recipients.users, undefined);
  // Disconnect.
  log.length = 0;
  await actions.businessBotRemove();
  const removed = log.find((r) => r.className === 'UpdateConnectedBot');
  assert.equal(removed.deleted, true);
  connectedBots = [];
  log.length = 0;
  assert.deepEqual(await actions.businessBotRemove(), { ok: true, bot: null });
  assert.equal(
    log.some((r) => r.className === 'UpdateConnectedBot'),
    false
  );
});

test('chatbot: bad input never leaves; a user that is not a bot is refused', async () => {
  const { actions, log } = make(createBusinessBots, (r) =>
    r.className === 'GetConnectedBots'
      ? { connectedBots: [], users: [] }
      : { peer: { userId: 1n }, users: [{ id: 1n, bot: false }] }
  );
  const recipients = {
    existingChats: true,
    newChats: false,
    contacts: false,
    nonContacts: false,
  };
  for (const bad of [
    { username: 'ab', recipients, canReply: true },
    {
      username: 'good_bot',
      recipients: { ...recipients, existingChats: false },
      canReply: true,
    },
    { username: 'good_bot', recipients, canReply: 'yes' },
  ]) {
    assert.equal((await actions.businessBotSet(bad)).ok, false);
  }
  assert.equal(log.length, 0);
  assert.equal(
    (
      await actions.businessBotSet({
        username: 'person',
        recipients,
        canReply: true,
      })
    ).code,
    'no-bot'
  );
});

test('the bar over a managed chat: read, pause, resume, remove', async () => {
  const { actions, log } = make(createBusinessBots, (r) =>
    r.className === 'GetPeerSettings'
      ? {
          settings: {
            businessBotId: 500n,
            businessBotPaused: true,
            businessBotCanReply: true,
            businessBotManageUrl: 'https://x',
          },
          users: [{ id: 500n, firstName: 'Shop Bot' }],
        }
      : true
  );
  assert.deepEqual((await actions.businessBotChat({ chat: '42' })).bar, {
    id: '500',
    name: 'Shop Bot',
    paused: true,
    canReply: true,
    manageUrl: 'https://x',
  });
  await actions.businessBotPause({ chat: '42', paused: false });
  assert.equal(log.at(-1).className, 'ToggleConnectedBotPaused');
  assert.equal(log.at(-1).paused, false);
  await actions.businessBotDisable({ chat: '42' });
  assert.equal(log.at(-1).className, 'DisablePeerConnectedBot');
  const none = make(createBusinessBots, () => ({ settings: {}, users: [] }));
  assert.equal((await none.actions.businessBotChat({ chat: '42' })).bar, null);
  assert.equal((await none.actions.businessBotPause({ chat: '42' })).ok, false);
});

test('folders: the tag colour and whether tags are shown', async () => {
  const filters = {
    tagsEnabled: true,
    filters: [
      { className: 'DialogFilterDefault' },
      {
        className: 'DialogFilter',
        id: 2,
        title: { text: 'Work' },
        color: 3,
        includePeers: [],
        excludePeers: [],
        pinnedPeers: [],
      },
      {
        className: 'DialogFilter',
        id: 3,
        title: { text: 'Home' },
        includePeers: [],
        excludePeers: [],
        pinnedPeers: [],
      },
    ],
  };
  const { folderList } = createFolders(
    {
      importer: async () => ({
        Api: { messages: { GetDialogFilters: named('GetDialogFilters') } },
      }),
    },
    { userClient: async () => ({ invoke: async () => filters }) }
  );
  const answer = await folderList();
  assert.equal(answer.tags, true);
  assert.deepEqual(
    answer.folders.filter((f) => !f.all).map((f) => f.color),
    [3, null]
  );
  assert.equal(folderOf(filters.filters[1]).color, 3);
  assert.equal(validFolder({ title: 'A', include: ['5'], color: 6 }), true);
  assert.equal(validFolder({ title: 'A', include: ['5'], color: 7 }), false);
  assert.equal(
    validFolder({ title: 'A', include: ['5'], color: 'red' }),
    false
  );
  const draft = draftOf({ id: 2, title: 'Work', include: ['5'], color: 3 });
  assert.equal(requestOf(draft).folder.color, 3);
  assert.equal(requestOf({ ...draft, color: null }).folder.color, undefined);
});

test('routes: strict bodies; nothing reaches the account when wrong', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => (
        calls.push([name, body]),
        { ok: true }
      ),
    }
  );
  const ok = [
    ['business-hours', {}],
    [
      'business-hours-set',
      { timezone: 'Europe/Berlin', weekly: [{ start: 0, end: 60 }] },
    ],
    ['business-location', {}],
    ['business-location-set', { address: 'x', lat: 1, lon: 2 }],
    ['business-location-set', { address: '' }],
    ['business-intro', {}],
    ['business-intro-stickers', {}],
    ['business-intro-set', { title: 'a', description: 'b', sticker: '5' }],
    ['business-profile', { chat: '5' }],
    ['business-links', {}],
    ['business-link-create', { message: 'hi', title: 't' }],
    ['business-link-edit', { slug: 'ab-1', message: 'hi' }],
    ['business-link-delete', { slug: 'ab-1' }],
    ['business-link-resolve', { slug: 'ab-1' }],
    ['business-bot', {}],
    [
      'business-bot-set',
      {
        username: 'a_bot',
        canReply: true,
        recipients: {
          existingChats: true,
          newChats: false,
          contacts: false,
          nonContacts: false,
        },
      },
    ],
    ['business-bot-remove', {}],
    ['business-bot-chat', { chat: '5' }],
    ['business-bot-pause', { chat: '5', paused: true }],
    ['business-bot-disable', { chat: '5' }],
    ['folders-tags-set', { enabled: false }],
  ];
  for (const [route, body] of ok) {
    assert.equal((await post(route, body, account)).status, 200, route);
  }
  const bad = [
    ['business-hours', { x: 1 }],
    ['business-hours-set', { timezone: 'Europe/Berlin' }],
    ['business-hours-set', { timezone: 'a b', weekly: [] }],
    ['business-hours-set', { timezone: 'UTC', weekly: [{ start: 5, end: 1 }] }],
    ['business-location-set', { address: 'x', lat: 1 }],
    ['business-location-set', { address: 'x', lat: 100, lon: 1 }],
    ['business-intro-set', { title: 'a' }],
    ['business-intro-set', { title: 'a', description: 'b', sticker: 'x' }],
    ['business-profile', { chat: '-1005' }],
    ['business-link-create', { message: '' }],
    ['business-link-create', { message: 'x', extra: 1 }],
    ['business-link-edit', { message: 'x' }],
    ['business-link-delete', { slug: 'a/b' }],
    ['business-link-resolve', {}],
    ['business-bot-set', { username: 'a_bot', canReply: true }],
    [
      'business-bot-set',
      {
        username: 'a_bot',
        canReply: true,
        recipients: {
          existingChats: false,
          newChats: false,
          contacts: false,
          nonContacts: false,
        },
      },
    ],
    ['business-bot-pause', { chat: '5' }],
    ['business-bot-disable', { chat: 'x' }],
    ['folders-tags-set', { enabled: 'on' }],
  ];
  const before = calls.length;
  for (const [route, body] of bad) {
    assert.equal((await post(route, body, account)).status, 400, route);
  }
  assert.equal(calls.length, before, 'no bad body was passed on');
});

test('the Api names used all exist in layer 225', async () => {
  const tl = await readFile(
    new URL('../src/sources/telegram-api/layer-232.tl', import.meta.url),
    'utf8'
  );
  for (const name of [
    'account.updateBusinessWorkHours#',
    'account.updateBusinessLocation#',
    'account.updateBusinessIntro#',
    'account.getBusinessChatLinks#',
    'account.createBusinessChatLink#',
    'account.editBusinessChatLink#',
    'account.deleteBusinessChatLink#',
    'account.resolveBusinessChatLink#',
    'account.getConnectedBots#',
    'account.updateConnectedBot#',
    'account.toggleConnectedBotPaused#',
    'account.disablePeerConnectedBot#',
    'messages.toggleDialogFilterTags#',
    'messages.getStickers#',
    'messages.getPeerSettings#',
    'help.getTimezonesList#',
    'contacts.resolveUsername#',
    'users.getFullUser#',
    'inputBusinessIntro#',
    'inputBusinessChatLink#',
    'inputBusinessBotRecipients#',
    'businessBotRights#',
    'businessWorkHours#',
    'businessWeeklyOpen#',
    'inputGeoPoint#',
    'inputDocument#',
  ]) {
    assert.ok(tl.includes(`\n${name}`), name);
  }
});

// -- the page's pure helpers ------------------------------------------------

test("hours: days from Telegram's list and back, wrapping Sunday into Monday", () => {
  const weekly = [
    { start: 540, end: 1080 },
    { start: 1980, end: 2880 + 60 },
  ];
  const days = toDays(weekly);
  assert.deepEqual(days[0], [{ from: 540, to: 1080 }]);
  assert.deepEqual(days[1], [{ from: 540, to: 1440 }]);
  assert.deepEqual(days[2], [{ from: 0, to: 60 }]);
  assert.deepEqual(toWeekly(days), weekly);
  // Sunday evening into Monday morning is one interval that wraps.
  const wrap = toDays([{ start: 10_080 - 120, end: 10_080 + 60 }]);
  assert.deepEqual(wrap[6], [{ from: 1320, to: 1440 }]);
  assert.deepEqual(wrap[0], [{ from: 0, to: 60 }]);
  assert.deepEqual(toWeekly(wrap), [{ start: 10_080 - 120, end: 10_080 + 60 }]);
  assert.equal(validWeekly(toWeekly(wrap)), true);
  assert.equal(validWeekly(toWeekly(days)), true);
});

test('hours: problems, times, text, the starting hours', () => {
  const empty = Array.from({ length: 7 }, () => []);
  assert.equal(daysProblem(empty), null);
  assert.equal(
    daysProblem([[{ from: 600, to: 600 }], ...empty.slice(1)]),
    'hours-invalid'
  );
  assert.equal(
    daysProblem([
      [
        { from: 0, to: 700 },
        { from: 600, to: 900 },
      ],
      ...empty.slice(1),
    ]),
    'hours-overlap'
  );
  assert.equal(parseTime('09:30'), 570);
  assert.equal(parseTime('9:30'), 570);
  assert.equal(parseTime('24:00'), 1440);
  assert.equal(parseTime('12:75'), null);
  assert.equal(parseTime('x'), null);
  assert.equal(
    rangesText([
      { from: 540, to: 1080 },
      { from: 1140, to: 1440 },
    ]),
    '09:00 – 18:00, 19:00 – 24:00'
  );
  const start = startDays(null);
  assert.equal(start[0].length, 1);
  assert.equal(start[6].length, 0);
  assert.deepEqual(startDays({ weekly: [{ start: 0, end: 60 }] })[0], [
    { from: 0, to: 60 },
  ]);
});

// 2024-01-15 was a Monday.
const NOW = Date.parse('2024-01-15T10:30:00Z');

test("hours: open now by the business's own clock, in either time zone", () => {
  assert.equal(offsetMinutes('Europe/Berlin', NOW), 60);
  assert.equal(offsetMinutes('Asia/Tokyo', NOW), 540);
  assert.equal(weekMinute('Europe/Berlin', NOW), 11 * 60 + 30);
  assert.equal(weekday('Europe/Berlin', NOW), 0);
  const weekly = [{ start: 9 * 60, end: 18 * 60 }];
  assert.equal(isOpen(weekly, 'Europe/Berlin', NOW), true);
  assert.equal(isOpen(weekly, 'Asia/Tokyo', NOW), false, '19:30 there');
  assert.equal(isOpen(weekly, 'Europe/Berlin', NOW + 8 * 3_600_000), false);
  // Running into Monday from Sunday night.
  const wrap = [{ start: 10_080 - 60, end: 10_080 + 12 * 60 }];
  assert.equal(isOpen(wrap, 'Europe/Berlin', NOW), true);
  // Their hours seen from Tokyo: nine hours' difference minus one.
  const shifted = shiftWeekly(weekly, 8 * 60);
  assert.deepEqual(shifted, [{ start: 17 * 60, end: 26 * 60 }]);
  assert.deepEqual(
    hoursIn(weekly, 'Europe/Berlin', 'Asia/Tokyo', NOW),
    shifted
  );
  assert.equal(hoursIn(weekly, 'Europe/Berlin', 'Europe/Berlin', NOW), weekly);
});

test("hoursView: today and the week in their zone or the viewer's", () => {
  const hours = {
    timezone: 'Europe/Berlin',
    weekly: [{ start: 9 * 60, end: 18 * 60 }],
    openNow: true,
  };
  const theirs = hoursView(hours, 'Europe/Berlin', NOW);
  assert.equal(theirs.open, true);
  assert.equal(theirs.todayIndex, 0);
  assert.equal(theirs.week[0].text, '09:00 – 18:00');
  assert.equal(theirs.week[1].text, '');
  const mine = hoursView(hours, 'Asia/Tokyo', NOW);
  assert.equal(mine.open, true, 'being open does not depend on who looks');
  assert.equal(mine.week[0].text, '17:00 – 24:00');
  assert.equal(mine.week[1].text, '00:00 – 02:00');
});

test('place: typed coordinates become the request, or a code', () => {
  assert.equal(coordinate('52,5', 90), 52.5);
  assert.equal(coordinate('91', 90), null);
  assert.equal(coordinate('x', 90), null);
  assert.deepEqual(locationRequest({ address: ' A ', lat: '', lon: '' }), {
    body: { address: 'A' },
  });
  assert.deepEqual(locationRequest({ address: 'A', lat: '1', lon: '2' }), {
    body: { address: 'A', lat: 1, lon: 2 },
  });
  assert.equal(
    locationRequest({ address: 'A', lat: '1', lon: '' }).code,
    'point-invalid'
  );
  assert.equal(
    locationRequest({ address: '', lat: '1', lon: '2' }).code,
    'address-empty'
  );
  assert.equal(
    locationRequest({ address: 'x'.repeat(97), lat: '', lon: '' }).code,
    'address-long'
  );
});

test('links: the slug of t.me/m/<slug>, the words, the label', () => {
  for (const [href, slug] of [
    ['https://t.me/m/AbC_123', 'AbC_123'],
    ['http://telegram.me/m/x-y', 'x-y'],
    ['tg://message?slug=Zed9', 'Zed9'],
  ]) {
    assert.equal(businessSlugOf(href), slug, href);
  }
  for (const href of [
    'https://t.me/m/',
    'https://t.me/m/a/b',
    'https://t.me/durov',
    'https://example.com/m/abc',
    'https://u:p@t.me/m/abc',
    'tg://resolve?domain=abc',
    'not a link',
    null,
  ]) {
    assert.equal(businessSlugOf(href), null, String(href));
  }
  assert.equal(linkProblem({ message: ' ', title: '' }), 'text-empty');
  assert.equal(
    linkProblem({ message: 'x'.repeat(4097), title: '' }),
    'text-long'
  );
  assert.equal(
    linkProblem({ message: 'x', title: 'y'.repeat(33) }),
    'title-long'
  );
  assert.equal(linkProblem({ message: 'x', title: '' }), null);
  assert.equal(linkLabel({ title: 'Promo', message: 'Hello' }), 'Promo');
  assert.equal(linkLabel({ title: '', message: 'Hello' }), 'Hello');
});

test('bot form: a name, the chats it serves, and what stops a Save', () => {
  assert.equal(botUsername(' @Shop_bot '), 'Shop_bot');
  assert.equal(botUsername('ab'), null);
  const fresh = botForm(null);
  assert.equal(fresh.canReply, true);
  assert.equal(botProblem(fresh), 'no-bot');
  assert.equal(botProblem({ ...fresh, username: 'shop_bot' }), null);
  assert.equal(
    botProblem({
      ...fresh,
      username: 'shop_bot',
      recipients: {
        existingChats: false,
        newChats: false,
        contacts: false,
        nonContacts: false,
      },
    }),
    'recipients-empty'
  );
  const form = botForm({
    username: 'shop_bot',
    canReply: false,
    recipients: {
      existingChats: true,
      newChats: false,
      contacts: true,
      nonContacts: false,
    },
  });
  assert.deepEqual(form.recipients, {
    existingChats: true,
    newChats: false,
    contacts: true,
    nonContacts: false,
  });
});

test('folder tags: only coloured folders, none on the open one', () => {
  assert.equal(isTag({ id: 2, color: 0 }, true), true);
  assert.equal(isTag({ id: 2, color: 0 }, false), false);
  assert.equal(isTag({ id: 2, color: null }, true), false);
  assert.equal(isTag({ id: 2, color: 7 }, true), false);
  assert.equal(isTag({ all: true, color: 1 }, true), false);
  const chat = (id) => ({
    key: `telegram:${id}`,
    source: 'telegram',
    chat: String(id),
    kind: 'user',
  });
  const folder = (id, title, color, include) => ({
    id,
    title,
    color,
    tag: isTag({ id, color }, true),
    include,
    exclude: [],
    pinned: [],
  });
  const folders = [
    folder(2, 'Work', 3, ['1', '2']),
    folder(3, 'Home', null, ['1']),
    folder(4, 'Fun', 5, ['1']),
  ];
  const chats = [chat(1), chat(2), chat(9)];
  const map = tagMap(chats, folders, new Map());
  assert.deepEqual(
    map.get('telegram:1').map((t) => t.title),
    ['Work', 'Fun']
  );
  assert.deepEqual(map.get('telegram:2'), [{ id: 2, title: 'Work', color: 3 }]);
  assert.equal(map.has('telegram:9'), false);
  assert.deepEqual(
    tagMap(chats, folders, new Map(), 2)
      .get('telegram:1')
      .map((t) => t.title),
    ['Fun'],
    'the open folder is not a tag on its own chats'
  );
  assert.equal(tagMap(chats, [], new Map()).size, 0);
});
