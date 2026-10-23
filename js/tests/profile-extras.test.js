// Profile extras (R-Y178): a birthday, name and profile colours, the
// personal channel and the contacts' birthdays — the source module with
// fake clients, the routes' validation and the page's pure helpers. The
// clock is fixed everywhere; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createProfileExtras,
  daysUntil,
  validBirthday,
} from '../src/sources/telegram-profile-extras.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';
import {
  ageOf,
  birthdayOfForm,
  colorsOf,
  daysIn,
  gradientOf,
  isBirthdayToday,
  sameBirthday,
} from '../src/web/profile-extras-model.js';
import { writesOf } from '../src/web/chat-profile-extras.js';
import { whenText } from '../src/web/chat-person-extras.js';

const Api = {
  InputUserSelf: named('InputUserSelf'),
  InputUser: named('InputUser'),
  InputChannel: named('InputChannel'),
  InputChannelEmpty: named('InputChannelEmpty'),
  InputMessageID: named('InputMessageID'),
  Birthday: named('Birthday'),
  PeerColor: named('PeerColor'),
  users: { GetFullUser: named('GetFullUser') },
  account: {
    UpdateBirthday: named('UpdateBirthday'),
    UpdateColor: named('UpdateColor'),
    UpdatePersonalChannel: named('UpdatePersonalChannel'),
  },
  help: {
    GetPeerColors: named('GetPeerColors'),
    GetPeerProfileColors: named('GetPeerProfileColors'),
  },
  channels: {
    GetAdminedPublicChannels: named('GetAdminedPublicChannels'),
    GetMessages: named('GetMessages'),
    GetFullChannel: named('GetFullChannel'),
  },
  contacts: { GetBirthdays: named('GetBirthdays') },
};

const NOW = new Date(2026, 5, 15, 12).getTime();
const channel = {
  className: 'Channel',
  id: 55n,
  accessHash: 9n,
  title: 'My Blog',
  username: 'myblog',
  participantsCount: 120,
};

const make = (answer) => {
  const log = [];
  const client = fakeClient(answer, log);
  const env = {
    now: () => NOW,
    importer: async () => ({ Api, helpers }),
    connection: {
      withPeer: async (_c, chat, use) =>
        use({ userId: BigInt(chat), accessHash: 3n }),
    },
  };
  return {
    actions: createProfileExtras(env, { userClient: async () => client }),
    log,
  };
};

test('profileExtras reads birthday, colours and personal channel', async () => {
  const { actions, log } = make(() => ({
    fullUser: {
      birthday: { day: 3, month: 4, year: 1990 },
      personalChannelId: 55n,
    },
    users: [
      {
        self: true,
        premium: true,
        color: { color: 5, backgroundEmojiId: 77n },
        profileColor: { color: 2 },
      },
    ],
    chats: [channel],
  }));
  const got = await actions.profileExtras();
  assert.equal(log[0].id.className, 'InputUserSelf');
  assert.deepEqual(got, {
    ok: true,
    premium: true,
    birthday: { day: 3, month: 4, year: 1990 },
    color: { color: 5, emoji: '77' },
    profileColor: { color: 2, emoji: null },
    personalChannel: { chat: '-10055', title: 'My Blog' },
  });
});

test('birthdaySave sets, removes and refuses', async () => {
  const { actions, log } = make(() => true);
  assert.equal((await actions.birthdaySave({ day: 29, month: 2 })).ok, true);
  assert.equal(log[0].className, 'UpdateBirthday');
  assert.deepEqual(log[0].birthday.day, 29);
  assert.equal(log[0].birthday.year, undefined);
  await actions.birthdaySave({ day: 5, month: 6, year: 2000 });
  assert.equal(log[1].birthday.year, 2000);
  await actions.birthdaySave({ remove: true });
  assert.equal(log[2].birthday, undefined);
  assert.equal(
    (await actions.birthdaySave({ day: 30, month: 2 })).code,
    'birthday-invalid'
  );
  assert.equal(
    (await actions.birthdaySave({ day: 29, month: 2, year: 2001 })).code,
    'birthday-invalid'
  );
  assert.equal(log.length, 3);
  const bad = make(() => telegramError('BIRTHDAY_INVALID'));
  assert.equal(
    (await bad.actions.birthdaySave({ day: 1, month: 1 })).code,
    'birthday-invalid'
  );
});

test('profileColors keeps palettes by hash', async () => {
  let hash = 0;
  const { actions, log } = make((request) => {
    if (request.hash === 5) {
      return { className: 'help.PeerColorsNotModified' };
    }
    hash = 5;
    return request.className === 'GetPeerColors'
      ? {
          hash,
          colors: [
            { colorId: 0, colors: { colors: [0xff0000] } },
            { colorId: 1, hidden: true, colors: { colors: [0] } },
            { colorId: 8, colors: { colors: [0x00ff00, 0x0000ff] } },
          ],
        }
      : {
          hash,
          colors: [
            {
              colorId: 3,
              colors: { paletteColors: [1], bgColors: [0x123456, 0x654321] },
              darkColors: { paletteColors: [2], bgColors: [0x111111] },
            },
          ],
        };
  });
  const first = await actions.profileColors();
  assert.deepEqual(first.name, [
    { id: 0, colors: ['#ff0000'] },
    { id: 8, colors: ['#00ff00', '#0000ff'] },
  ]);
  assert.deepEqual(first.profile, [
    { id: 3, colors: ['#123456', '#654321'], dark: ['#111111'] },
  ]);
  const again = await actions.profileColors();
  assert.deepEqual(again, first);
  assert.equal(log.length, 4);
  assert.equal(log[2].hash, 5);
});

test('colorSave sets with forProfile, removes, and maps Premium', async () => {
  const { actions, log } = make(() => true);
  await actions.colorSave({ forProfile: true, color: 4, emoji: '123' });
  assert.equal(log[0].className, 'UpdateColor');
  assert.equal(log[0].forProfile, true);
  assert.equal(log[0].color.color, 4);
  assert.equal(log[0].color.backgroundEmojiId, 123n);
  await actions.colorSave({ forProfile: false });
  assert.equal(log[1].forProfile, undefined);
  assert.equal(log[1].color, undefined);
  assert.equal((await actions.colorSave({ color: 1 })).code, 'color-invalid');
  assert.equal(
    (await actions.colorSave({ forProfile: false, color: 99 })).code,
    'color-invalid'
  );
  assert.equal(log.length, 2);
  const locked = make(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal(
    (await locked.actions.colorSave({ forProfile: false, color: 1 })).code,
    'premium'
  );
});

test('personal channel: listed for personal, saved, removed', async () => {
  const { actions, log } = make((request) =>
    request.className === 'GetAdminedPublicChannels'
      ? { chats: [channel, { className: 'Chat', id: 1n }] }
      : true
  );
  const list = await actions.personalChannels();
  assert.equal(log[0].forPersonal, true);
  assert.deepEqual(list.channels, [
    { chat: '-10055', title: 'My Blog', username: 'myblog', members: 120 },
  ]);
  assert.equal(
    (await actions.personalChannelSave({ chat: '-10055' })).ok,
    true
  );
  const save = log.find((r) => r.className === 'UpdatePersonalChannel');
  assert.equal(save.channel.className, 'InputChannel');
  assert.equal(save.channel.accessHash, 9n);
  await actions.personalChannelSave({ remove: true });
  assert.equal(log.at(-1).channel.className, 'InputChannelEmpty');
  assert.equal(
    (await actions.personalChannelSave({ chat: '-10099' })).code,
    'no-channel'
  );
  assert.equal(
    (await actions.personalChannelSave({ chat: '5' })).code,
    'no-channel'
  );
});

test('personalChannelCard gives the channel, its members and latest post', async () => {
  const { actions, log } = make((request) => {
    if (request.className === 'GetFullUser') {
      return {
        fullUser: { personalChannelId: 55n, personalChannelMessage: 12 },
        users: [],
        chats: [{ ...channel, participantsCount: undefined }],
      };
    }
    return request.className === 'GetMessages'
      ? { messages: [{ className: 'Message', id: 12, message: 'Hello world' }] }
      : { fullChat: { participantsCount: 4321 } };
  });
  const got = await actions.personalChannelCard({ chat: '42' });
  assert.equal(log[0].id.className, 'InputUser');
  assert.deepEqual(got.card, {
    chat: '-10055',
    title: 'My Blog',
    username: 'myblog',
    members: 4321,
    message: { id: 12, text: 'Hello world' },
  });
  const none = make(() => ({ fullUser: {}, users: [], chats: [] }));
  assert.deepEqual(await none.actions.personalChannelCard({ chat: '42' }), {
    ok: true,
    card: null,
  });
  assert.equal(
    (await none.actions.personalChannelCard({ chat: 'x' })).ok,
    false
  );
});

test('contactBirthdays lists today and the week, nearest first', async () => {
  const { actions } = make(() => ({
    contacts: [
      { contactId: 2n, birthday: { day: 20, month: 6 } },
      { contactId: 1n, birthday: { day: 15, month: 6, year: 1999 } },
      { contactId: 3n, birthday: { day: 1, month: 1 } },
      { contactId: 4n, birthday: { day: 14, month: 6 } },
    ],
    users: [
      { id: 1n, firstName: 'Ann', lastName: 'Lee' },
      { id: 2n, username: 'bob' },
    ],
  }));
  const got = await actions.contactBirthdays();
  assert.deepEqual(
    got.birthdays.map((b) => [b.chat, b.name, b.days]),
    [
      ['1', 'Ann Lee', 0],
      ['2', 'bob', 5],
    ]
  );
  assert.equal(got.birthdays[0].year, 1999);
});

test('daysUntil and validBirthday', () => {
  const now = new Date(2026, 5, 15);
  assert.equal(daysUntil({ day: 15, month: 6 }, now), 0);
  assert.equal(daysUntil({ day: 14, month: 6 }, now), 364);
  assert.equal(daysUntil({ day: 1, month: 7 }, now), 16);
  assert.equal(validBirthday({ day: 31, month: 4 }), false);
  assert.equal(validBirthday({ day: 29, month: 2, year: 2000 }), true);
  assert.equal(validBirthday({ day: 1, month: 1, year: 1800 }), false);
});

test('the routes validate and pass on', async () => {
  const seen = [];
  const note = (name) => async (r) => (seen.push([name, r]), { ok: true });
  const account = {
    profileExtras: note('extras'),
    birthdaySave: note('birthday'),
    profileColors: note('colors'),
    colorSave: note('color'),
    personalChannels: note('channels'),
    personalChannelSave: note('save'),
    personalChannelCard: note('card'),
    contactBirthdays: note('birthdays'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('profile-extras', {}), 200);
  assert.equal(await status('birthday-save', { day: 1, month: 2 }), 200);
  assert.equal(await status('birthday-save', { remove: true }), 200);
  assert.equal(await status('birthday-save', { day: 31, month: 2 }), 400);
  assert.equal(await status('birthday-save', {}), 400);
  assert.equal(await status('profile-colors', {}), 200);
  assert.equal(
    await status('color-save', { forProfile: true, color: 3, emoji: '9' }),
    200
  );
  assert.equal(await status('color-save', { forProfile: false }), 200);
  assert.equal(await status('color-save', { color: 3 }), 400);
  assert.equal(
    await status('color-save', { forProfile: true, color: 99 }),
    400
  );
  assert.equal(
    await status('color-save', { forProfile: true, emoji: 'x' }),
    400
  );
  assert.equal(await status('personal-channels', {}), 200);
  assert.equal(await status('personal-channel-save', { chat: '-10055' }), 200);
  assert.equal(await status('personal-channel-save', { remove: true }), 200);
  assert.equal(await status('personal-channel-save', { chat: '5' }), 400);
  assert.equal(await status('personal-channel', { chat: '42' }), 200);
  assert.equal(await status('personal-channel', { chat: '-1' }), 400);
  assert.equal(await status('contact-birthdays', {}), 200);
  assert.equal(seen.length, 11);
});

test('page helpers: age, today, form, colours, writes', () => {
  const now = new Date(2026, 5, 15, 9);
  assert.equal(isBirthdayToday({ day: 15, month: 6 }, now), true);
  assert.equal(isBirthdayToday({ day: 16, month: 6 }, now), false);
  assert.equal(isBirthdayToday(null, now), false);
  assert.equal(ageOf({ day: 15, month: 6, year: 2000 }, now), 26);
  assert.equal(ageOf({ day: 16, month: 6, year: 2000 }, now), 25);
  assert.equal(ageOf({ day: 1, month: 1 }, now), null);
  assert.equal(daysIn(2), 29);
  assert.equal(daysIn(2, 2001), 28);
  assert.deepEqual(birthdayOfForm({ day: '29', month: '2', year: '' }), {
    day: 29,
    month: 2,
  });
  assert.equal(birthdayOfForm({ day: '29', month: '2', year: '2001' }), null);
  assert.equal(birthdayOfForm({ day: '', month: '2', year: '' }), null);
  assert.equal(sameBirthday(null, { day: 1, month: 1 }), false);
  assert.equal(sameBirthday(null, undefined), true);
  assert.deepEqual(colorsOf([{ id: 9, colors: ['#fff'] }], 9), ['#fff']);
  assert.equal(colorsOf([], 2).length, 2);
  assert.equal(colorsOf([], 30), null);
  assert.match(gradientOf(['#111']), /linear-gradient\(135deg, #111, #111\)/);
  assert.equal(gradientOf([]), undefined);
  const t = (key, o) => `${key}${o ? JSON.stringify(o) : ''}`;
  assert.equal(whenText(t, 0), 'chat.birthdays.today');
  assert.equal(whenText(t, 1), 'chat.birthdays.tomorrow');
  assert.equal(whenText(t, 3), 'chat.birthdays.inDays{"count":3}');

  const was = {
    birthday: { day: 1, month: 1 },
    color: { color: 1, emoji: null },
    profileColor: null,
    personalChannel: { chat: '-10055' },
  };
  const same = {
    birthday: { day: 1, month: 1 },
    color: { color: 1, emoji: null },
    profileColor: { color: null, emoji: null },
    channel: '-10055',
  };
  assert.deepEqual(writesOf(was, same), []);
  assert.deepEqual(
    writesOf(was, {
      birthday: null,
      color: { color: 2, emoji: '5' },
      profileColor: { color: 3, emoji: null },
      channel: null,
    }),
    [
      ['telegramBirthdaySave', { remove: true }],
      ['telegramColorSave', { forProfile: false, color: 2, emoji: '5' }],
      ['telegramColorSave', { forProfile: true, color: 3 }],
      ['telegramPersonalChannelSave', { remove: true }],
    ]
  );
});
