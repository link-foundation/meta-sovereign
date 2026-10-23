// Telegram Business quick replies, greeting and away messages (R-Y179): the
// source modules with fake clients (what each action asks Telegram, its
// refusals as codes), the routes' validation, and the page's pure helpers.
// No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createQuickReplies } from '../src/sources/telegram-quick-replies.js';
import { createBusinessMessages } from '../src/sources/telegram-business-messages.js';
import {
  CustomFile,
  fakeClient,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';
import {
  EVERYONE,
  formOf,
  fromLocalInput,
  nameProblem,
  quickCommands,
  reachesAnyone,
  requestOf,
  scheduleOf,
  toLocalInput,
  withCategory,
  withPerson,
  isPerson,
} from '../src/web/quick-replies-model.js';

const Api = {
  InputPeerSelf: named('InputPeerSelf'),
  InputUserSelf: named('InputUserSelf'),
  InputUser: named('InputUser'),
  InputQuickReplyShortcut: named('InputQuickReplyShortcut'),
  InputQuickReplyShortcutId: named('InputQuickReplyShortcutId'),
  InputBusinessRecipients: named('InputBusinessRecipients'),
  InputBusinessGreetingMessage: named('InputBusinessGreetingMessage'),
  InputBusinessAwayMessage: named('InputBusinessAwayMessage'),
  BusinessAwayMessageScheduleAlways: named('ScheduleAlways'),
  BusinessAwayMessageScheduleOutsideWorkHours: named('ScheduleOutside'),
  BusinessAwayMessageScheduleCustom: named('ScheduleCustom'),
  users: { GetFullUser: named('GetFullUser') },
  account: {
    UpdateBusinessGreetingMessage: named('UpdateGreeting'),
    UpdateBusinessAwayMessage: named('UpdateAway'),
  },
  messages: {
    GetQuickReplies: named('GetQuickReplies'),
    GetQuickReplyMessages: named('GetQuickReplyMessages'),
    CheckQuickReplyShortcut: named('CheckQuickReplyShortcut'),
    SendMessage: named('SendMessage'),
    EditMessage: named('EditMessage'),
    DeleteQuickReplyMessages: named('DeleteQuickReplyMessages'),
    EditQuickReplyShortcut: named('EditQuickReplyShortcut'),
    DeleteQuickReplyShortcut: named('DeleteQuickReplyShortcut'),
    ReorderQuickReplies: named('ReorderQuickReplies'),
    SendQuickReplyMessages: named('SendQuickReplyMessages'),
  },
};

const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => BigInt(b.length),
};

const env = (client) => ({
  importer: async () => ({ Api, CustomFile, helpers }),
  connection: {
    withPeer: async (_c, chat, use) =>
      use({ chat, userId: BigInt(chat), accessHash: 77n }),
  },
  client,
});

const quickOf = (answer) => {
  const log = [];
  const client = {
    ...fakeClient(answer, log),
    getInputEntity: async (id) => ({ userId: id, accessHash: 5n }),
  };
  return {
    log,
    actions: createQuickReplies(env(client), {
      userClient: async () => client,
    }),
    business: createBusinessMessages(env(client), {
      userClient: async () => client,
    }),
  };
};

const listing = {
  quickReplies: [
    { shortcutId: 1, shortcut: 'hello', topMessage: 11, count: 2 },
    { shortcutId: 2, shortcut: 'away', topMessage: 21, count: 1 },
  ],
  messages: [
    { id: 11, message: 'Hi!' },
    { id: 21, message: '', media: { className: 'MessageMediaPhoto' } },
  ],
};

test('quickReplies lists shortcuts with the first message', async () => {
  const { actions, log } = quickOf(() => listing);
  assert.deepEqual(await actions.quickReplies(), {
    ok: true,
    replies: [
      { id: 1, name: 'hello', count: 2, preview: 'Hi!' },
      { id: 2, name: 'away', count: 1, preview: 'photo' },
    ],
  });
  assert.equal(log[0].className, 'GetQuickReplies');
});

test('quickReplyMessages reads one shortcut', async () => {
  const { actions, log } = quickOf(() => ({
    messages: [
      { id: 11, message: 'Hi!' },
      { id: 12, message: '', media: { className: 'MessageMediaDocument' } },
    ],
  }));
  const answer = await actions.quickReplyMessages({ shortcutId: 1 });
  assert.deepEqual(answer.messages, [
    { id: 11, text: 'Hi!', media: null },
    { id: 12, text: '', media: 'file' },
  ]);
  assert.equal(log[0].shortcutId, 1);
  assert.equal((await actions.quickReplyMessages({})).code, 'bad-request');
});

test('creating checks the name, then sends the first message', async () => {
  const { actions, log } = quickOf((r) =>
    r.className === 'CheckQuickReplyShortcut' ? true : { ok: 1 }
  );
  assert.deepEqual(await actions.quickReplyCreate({ name: 'bye', text: 'x' }), {
    ok: true,
  });
  assert.deepEqual(
    log.map((r) => r.className),
    ['CheckQuickReplyShortcut', 'SendMessage']
  );
  assert.equal(log[1].peer.className, 'InputPeerSelf');
  assert.equal(log[1].quickReplyShortcut.className, 'InputQuickReplyShortcut');
  assert.equal(log[1].quickReplyShortcut.shortcut, 'bye');
  assert.equal(log[1].message, 'x');
});

test('creating refuses bad names, empty text and taken names', async () => {
  const { actions, log } = quickOf(() => false);
  assert.equal(
    (await actions.quickReplyCreate({ name: 'a b', text: 'x' })).code,
    'bad-name'
  );
  assert.equal(
    (await actions.quickReplyCreate({ name: 'ab', text: ' ' })).code,
    'empty'
  );
  assert.equal(log.length, 0);
  assert.equal(
    (await actions.quickReplyCreate({ name: 'ab', text: 'x' })).code,
    'name-taken'
  );
  assert.equal(log.length, 1);
});

test('adding sends into the shortcut id; editing names it too', async () => {
  const { actions, log } = quickOf(() => ({}));
  await actions.quickReplyAdd({ shortcutId: 3, text: 'more' });
  assert.equal(
    log[0].quickReplyShortcut.className,
    'InputQuickReplyShortcutId'
  );
  assert.equal(log[0].quickReplyShortcut.shortcutId, 3);
  await actions.quickReplyEdit({ shortcutId: 3, id: 31, text: 'new' });
  assert.equal(log[1].className, 'EditMessage');
  assert.equal(log[1].quickReplyShortcutId, 3);
  assert.equal(log[1].id, 31);
  assert.equal(log[1].peer.className, 'InputPeerSelf');
});

test('delete, rename, reorder and delete messages', async () => {
  const { actions, log } = quickOf(() => true);
  await actions.quickReplyDeleteMessages({ shortcutId: 3, ids: [31, 32] });
  await actions.quickReplyRename({ shortcutId: 3, name: 'thanks' });
  await actions.quickReplyDelete({ shortcutId: 3 });
  await actions.quickReplyReorder({ order: [2, 1] });
  assert.deepEqual(
    log.map((r) => r.className),
    [
      'DeleteQuickReplyMessages',
      'EditQuickReplyShortcut',
      'DeleteQuickReplyShortcut',
      'ReorderQuickReplies',
    ]
  );
  assert.deepEqual(log[0].id, [31, 32]);
  assert.equal(log[1].shortcut, 'thanks');
  assert.deepEqual(log[3].order, [2, 1]);
  assert.equal(
    (await actions.quickReplyRename({ shortcutId: 3, name: '!' })).code,
    'bad-name'
  );
  assert.equal(
    (await actions.quickReplyReorder({ order: [] })).code,
    'bad-request'
  );
});

test('sending a shortcut to a chat asks for its messages first', async () => {
  const { actions, log } = quickOf((r) =>
    r.className === 'GetQuickReplyMessages'
      ? {
          messages: [
            { id: 11, message: 'a' },
            { id: 12, message: 'b' },
          ],
        }
      : {}
  );
  assert.deepEqual(
    await actions.quickReplySend({ chat: '42', shortcutId: 1 }),
    {
      ok: true,
      sent: 2,
    }
  );
  const send = log.at(-1);
  assert.equal(send.className, 'SendQuickReplyMessages');
  assert.equal(send.shortcutId, 1);
  assert.deepEqual(send.id, [11, 12]);
  assert.equal(send.randomId.length, 2);
  assert.equal(send.peer.chat, '42');
  assert.equal(
    (await actions.quickReplySend({ chat: '-5', shortcutId: 1 })).code,
    'bad-request'
  );
});

test('Telegram refusals become codes', async () => {
  const { actions } = quickOf(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  assert.equal((await actions.quickReplies()).code, 'premium');
  const taken = quickOf(() => telegramError('SHORTCUT_OCCUPIED'));
  assert.equal(
    (await taken.actions.quickReplyRename({ shortcutId: 1, name: 'a' })).code,
    'name-taken'
  );
  const many = quickOf(() => telegramError('QUICK_REPLIES_TOO_MUCH'));
  assert.equal(
    (await many.actions.quickReplyAdd({ shortcutId: 1, text: 'a' })).code,
    'too-many'
  );
});

const everyone = {
  existingChats: true,
  newChats: true,
  contacts: false,
  nonContacts: false,
  excludeSelected: false,
  users: ['5'],
};

test('businessMessages reads greeting and away from the full user', async () => {
  const { business, log } = quickOf((r) =>
    r.className === 'GetFullUser'
      ? {
          fullUser: {
            businessGreetingMessage: {
              shortcutId: 1,
              noActivityDays: 14,
              recipients: {
                contacts: true,
                excludeSelected: true,
                users: [5n],
              },
            },
            businessAwayMessage: {
              shortcutId: 2,
              offlineOnly: true,
              schedule: {
                className: 'BusinessAwayMessageScheduleCustom',
                startDate: 100,
                endDate: 200,
              },
              recipients: { existingChats: true },
            },
          },
          users: [{ id: 5n, firstName: 'Some', lastName: 'Friend' }],
        }
      : listing
  );
  const answer = await business.businessMessages();
  assert.equal(log[0].id.className, 'InputUserSelf');
  assert.equal(answer.greeting.noActivityDays, 14);
  assert.equal(answer.greeting.recipients.contacts, true);
  assert.deepEqual(answer.greeting.recipients.users, ['5']);
  assert.equal(answer.away.offlineOnly, true);
  assert.deepEqual(answer.away.schedule, {
    kind: 'custom',
    start: 100,
    end: 200,
  });
  assert.deepEqual(answer.people, [{ id: '5', name: 'Some Friend' }]);
  assert.deepEqual(answer.shortcuts, [
    { id: 1, name: 'hello' },
    { id: 2, name: 'away' },
  ]);
});

test('saving the greeting writes InputBusinessGreetingMessage', async () => {
  const { business, log } = quickOf(() => true);
  const saved = await business.businessGreetingSave({
    enabled: true,
    shortcutId: 1,
    noActivityDays: 21,
    recipients: everyone,
  });
  assert.deepEqual(saved, { ok: true });
  const message = log[0].message;
  assert.equal(log[0].className, 'UpdateGreeting');
  assert.equal(message.shortcutId, 1);
  assert.equal(message.noActivityDays, 21);
  assert.equal(message.recipients.existingChats, true);
  assert.equal(message.recipients.contacts, undefined);
  assert.equal(message.recipients.users[0].className, 'InputUser');
});

test('switching off writes no message; bad input writes nothing', async () => {
  const { business, log } = quickOf(() => true);
  await business.businessGreetingSave({ enabled: false });
  await business.businessAwaySave({ enabled: false });
  assert.deepEqual(Object.keys(log[0]), ['className']);
  assert.deepEqual(Object.keys(log[1]), ['className']);
  const bad = [
    { enabled: true, shortcutId: 'x', noActivityDays: 7, recipients: everyone },
    { enabled: true, shortcutId: 1, noActivityDays: 8, recipients: everyone },
    { enabled: true, shortcutId: 1, noActivityDays: 7, recipients: {} },
    {},
  ];
  for (const body of bad) {
    assert.equal(
      (await business.businessGreetingSave(body)).code,
      'bad-request'
    );
  }
  assert.equal(log.length, 2);
});

test('saving the away message with each schedule', async () => {
  const { business, log } = quickOf(() => true);
  const base = {
    enabled: true,
    shortcutId: 2,
    offlineOnly: true,
    recipients: everyone,
  };
  await business.businessAwaySave({ ...base, schedule: { kind: 'always' } });
  await business.businessAwaySave({ ...base, schedule: { kind: 'outside' } });
  await business.businessAwaySave({
    ...base,
    schedule: { kind: 'custom', start: 10, end: 20 },
  });
  const kinds = log.map((r) => r.message.schedule.className);
  assert.deepEqual(kinds, [
    'ScheduleAlways',
    'ScheduleOutside',
    'ScheduleCustom',
  ]);
  assert.equal(log[2].message.schedule.endDate, 20);
  assert.equal(log[0].message.offlineOnly, true);
  assert.equal(
    (
      await business.businessAwaySave({
        ...base,
        schedule: { kind: 'custom', start: 20, end: 10 },
      })
    ).code,
    'bad-request'
  );
});

test('a Premium refusal on Save is a code', async () => {
  const { business } = quickOf(() => telegramError('PREMIUM_ACCOUNT_REQUIRED'));
  const saved = await business.businessGreetingSave({
    enabled: true,
    shortcutId: 1,
    noActivityDays: 7,
    recipients: everyone,
  });
  assert.equal(saved.code, 'premium');
});

test('the routes validate before asking the account', async () => {
  const seen = [];
  const note = (name) => async (b) => (seen.push([name, b]), { ok: true });
  const account = {
    quickReplies: note('list'),
    quickReplyMessages: note('messages'),
    quickReplyCreate: note('create'),
    quickReplyAdd: note('add'),
    quickReplyEdit: note('edit'),
    quickReplyDeleteMessages: note('delete-messages'),
    quickReplyRename: note('rename'),
    quickReplyDelete: note('delete'),
    quickReplyReorder: note('reorder'),
    quickReplySend: note('send'),
    businessMessages: note('business'),
    businessGreetingSave: note('greeting'),
    businessAwaySave: note('away'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('quick-replies', {}), 200);
  assert.equal(await status('quick-reply-messages', { shortcutId: 1 }), 200);
  assert.equal(await status('quick-reply-messages', { shortcutId: 'x' }), 400);
  assert.equal(
    await status('quick-reply-create', { name: 'a', text: 'b' }),
    200
  );
  assert.equal(await status('quick-reply-create', { name: 'a' }), 400);
  assert.equal(
    await status('quick-reply-add', { shortcutId: 1, text: 'b' }),
    200
  );
  assert.equal(await status('quick-reply-add', { text: 'b' }), 400);
  assert.equal(
    await status('quick-reply-edit', { shortcutId: 1, id: 2, text: 'b' }),
    200
  );
  assert.equal(
    await status('quick-reply-edit', { shortcutId: 1, text: 'b' }),
    400
  );
  assert.equal(
    await status('quick-reply-delete-messages', { shortcutId: 1, ids: [1] }),
    200
  );
  assert.equal(
    await status('quick-reply-delete-messages', { shortcutId: 1, ids: 1 }),
    400
  );
  assert.equal(
    await status('quick-reply-rename', { shortcutId: 1, name: 'a' }),
    200
  );
  assert.equal(await status('quick-reply-delete', { shortcutId: 1 }), 200);
  assert.equal(await status('quick-reply-delete', {}), 400);
  assert.equal(await status('quick-reply-reorder', { order: [1, 2] }), 200);
  assert.equal(await status('quick-reply-reorder', { order: 'x' }), 400);
  assert.equal(
    await status('quick-reply-send', { chat: '5', shortcutId: 1 }),
    200
  );
  assert.equal(
    await status('quick-reply-send', { chat: 'me', shortcutId: 1 }),
    400
  );
  assert.equal(await status('business-messages', {}), 200);
  assert.equal(await status('business-greeting-save', { enabled: false }), 200);
  assert.equal(await status('business-greeting-save', {}), 400);
  assert.equal(await status('business-away-save', { enabled: 'yes' }), 400);
  assert.equal(seen.length, 12);
});

test('shortcut names are letters, digits and underscores', () => {
  assert.equal(nameProblem('hello_1'), null);
  assert.equal(nameProblem('привет'), null);
  assert.equal(nameProblem(''), 'bad-name');
  assert.equal(nameProblem('a b'), 'bad-name');
  assert.equal(nameProblem('x'.repeat(33)), 'bad-name');
});

test('the "/" list items hide empty shortcuts and carry the pick', () => {
  const items = quickCommands([
    { id: 1, name: 'hello', count: 1, preview: 'Hi' },
    { id: 2, name: 'empty', count: 0, preview: '' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].command, 'hello');
  assert.equal(items[0].description, 'Hi');
  assert.equal(items[0].quick, true);
  assert.equal(items[0].shortcutId, 1);
  assert.equal(
    isPerson({ source: 'telegram', chat: '5' }, { kind: 'user' }),
    true
  );
  assert.equal(
    isPerson({ source: 'telegram', chat: '5' }, { bot: true }),
    false
  );
  assert.equal(isPerson({ source: 'telegram', chat: '-5' }, {}), false);
});

test('forms: Telegram values in, requests out', () => {
  const NOW = 1_900_000_000;
  const shortcuts = [
    { id: 1, name: 'hello' },
    { id: 2, name: 'away' },
  ];
  const fresh = formOf('greeting', null, shortcuts, NOW);
  assert.equal(fresh.enabled, false);
  assert.equal(fresh.shortcutId, '1', 'the "hello" shortcut is the start');
  assert.equal(fresh.noActivityDays, 7);
  assert.deepEqual(requestOf('greeting', fresh), { body: { enabled: false } });
  const on = { ...fresh, enabled: true };
  assert.deepEqual(requestOf('greeting', on).body, {
    enabled: true,
    shortcutId: 1,
    recipients: EVERYONE,
    noActivityDays: 7,
  });
  assert.equal(
    requestOf('greeting', { ...on, shortcutId: '' }).problem,
    'no-shortcut'
  );
  const nobody = {
    ...on,
    recipients: {
      ...EVERYONE,
      existingChats: false,
      newChats: false,
      contacts: false,
      nonContacts: false,
    },
  };
  assert.equal(requestOf('greeting', nobody).problem, 'no-recipients');
  const away = formOf('away', null, shortcuts, NOW);
  assert.equal(away.shortcutId, '2');
  assert.equal(away.scheduleKind, 'always');
  assert.deepEqual(
    requestOf('away', { ...away, enabled: true }).body.schedule,
    { kind: 'always' }
  );
  const custom = { ...away, enabled: true, scheduleKind: 'custom' };
  assert.equal(
    requestOf('away', custom).body.schedule.end -
      requestOf('away', custom).body.schedule.start,
    7 * 86_400
  );
  assert.equal(
    requestOf('away', { ...custom, end: custom.start }).problem,
    'bad-range'
  );
});

test('recipients and times', () => {
  const r = withPerson(withPerson(EVERYONE, '5'), '6');
  assert.deepEqual(r.users, ['5', '6']);
  assert.deepEqual(withPerson(r, '5').users, ['6']);
  assert.equal(withCategory(EVERYONE, 'contacts', false).contacts, false);
  assert.equal(
    reachesAnyone({
      ...EVERYONE,
      existingChats: false,
      newChats: false,
      contacts: false,
      nonContacts: false,
    }),
    false
  );
  assert.equal(
    reachesAnyone({
      ...EVERYONE,
      existingChats: false,
      newChats: false,
      contacts: false,
      nonContacts: false,
      excludeSelected: false,
      users: ['5'],
    }),
    true
  );
  const seconds = 1_900_000_000;
  assert.equal(fromLocalInput(toLocalInput(seconds)), seconds - (seconds % 60));
  assert.equal(fromLocalInput('nope'), null);
  assert.deepEqual(scheduleOf('outside'), { schedule: { kind: 'outside' } });
});
