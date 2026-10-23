// A bot's commands (R-Y135): a bot chat's botInfo and menu button, a
// group's botInfo with the bots' names, the cache, the error codes, the
// route's validation, and matchCommands. Fake clients; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBotCommands } from '../src/sources/telegram-bot-commands.js';
import { named, postRoute } from './helpers/telegram-route.js';
import { matchCommands } from '../src/web/chat-bot-commands.js';

const Api = {
  users: { GetFullUser: named('GetFullUser') },
  messages: { GetFullChat: named('GetFullChat') },
  channels: { GetFullChannel: named('GetFullChannel') },
};

const make = ({ answer, fail = null } = {}) => {
  const log = [];
  const actions = createBotCommands(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          if (fail) {
            throw Object.assign(new Error(fail), { errorMessage: fail });
          }
          return answer;
        },
      }),
    }
  );
  return { ...actions, log };
};

const cmd = (command, description) => ({ command, description });
const bot = (id, username, firstName) => ({ id, username, firstName });

test('a bot chat: its commands and menu button kinds', async () => {
  const full = (menuButton) => ({
    fullUser: {
      botInfo: {
        commands: [cmd('start', 'Begin'), cmd('help', 'Help')],
        menuButton,
      },
    },
    users: [bot(7n, 'pizza_bot', 'Pizza')],
  });
  const kinds = [
    [undefined, { kind: 'default' }],
    [{ className: 'BotMenuButtonDefault' }, { kind: 'default' }],
    [{ className: 'BotMenuButtonCommands' }, { kind: 'commands' }],
    [
      { className: 'BotMenuButton', text: 'Order', url: 'https://x.test/app' },
      { kind: 'webapp', text: 'Order', url: 'https://x.test/app' },
    ],
  ];
  for (const [button, menu] of kinds) {
    const { botCommands, log } = make({ answer: full(button) });
    const got = await botCommands({ chat: '7' });
    assert.equal(got.ok, true);
    assert.deepEqual(got.menu, menu);
    assert.deepEqual(
      got.commands.map((c) => [c.command, c.description, c.bot]),
      [
        ['start', 'Begin', '7'],
        ['help', 'Help', '7'],
      ]
    );
    assert.equal(got.commands[0].username, 'pizza_bot');
    assert.equal(got.commands[0].botName, 'Pizza');
    assert.equal(log[0].className, 'GetFullUser');
  }
});

test('a user who is no bot has none', async () => {
  const { botCommands } = make({ answer: { fullUser: {}, users: [] } });
  assert.deepEqual(await botCommands({ chat: '9' }), {
    ok: true,
    commands: [],
    menu: { kind: 'default' },
  });
});

test('a group: one botInfo per bot, named by the users', async () => {
  const answer = {
    fullChat: {
      botInfo: [
        { userId: 11n, commands: [cmd('a', 'A one')] },
        { userId: 12n, commands: [cmd('b', 'B one'), cmd('c', 'C one')] },
        { userId: 13n },
      ],
    },
    users: [bot(11n, 'one_bot', 'One'), bot(12n, 'two_bot', 'Two')],
  };
  for (const [chat, ask] of [
    ['-5', 'GetFullChat'],
    ['-1001', 'GetFullChannel'],
  ]) {
    const { botCommands, log } = make({ answer });
    const got = await botCommands({ chat });
    assert.equal(log[0].className, ask);
    assert.deepEqual(
      got.commands.map((c) => [c.command, c.username, c.botName]),
      [
        ['a', 'one_bot', 'One'],
        ['b', 'two_bot', 'Two'],
        ['c', 'two_bot', 'Two'],
      ]
    );
    assert.deepEqual(got.menu, { kind: 'default' });
  }
});

test('answers are kept per chat for ten minutes', async () => {
  const answer = {
    fullUser: { botInfo: { commands: [cmd('x', 'X')] } },
    users: [],
  };
  const { botCommands, log } = make({ answer });
  await botCommands({ chat: '7' });
  await botCommands({ chat: '7' });
  assert.equal(log.length, 1);
  await botCommands({ chat: '8' });
  assert.equal(log.length, 2);
  const now = Date.now;
  Date.now = () => now() + 11 * 60_000;
  try {
    await botCommands({ chat: '7' });
  } finally {
    Date.now = now;
  }
  assert.equal(log.length, 3);
});

test('errors become codes and are not kept; bad chats refused', async () => {
  const failing = make({ fail: 'CHANNEL_PRIVATE' });
  const got = await failing.botCommands({ chat: '-1001' });
  assert.deepEqual([got.ok, got.code], [false, 'no-access']);
  await failing.botCommands({ chat: '-1001' });
  assert.equal(failing.log.length, 2);
  const bad = await failing.botCommands({ chat: 'x' });
  assert.equal(bad.ok, false);
  assert.equal(failing.log.length, 2);
});

test('the route validates the chat', async () => {
  const account = { botCommands: async () => ({ ok: true }) };
  for (const bad of [{}, { chat: 5 }, { chat: 'abc' }, { chat: '1; drop' }]) {
    assert.equal(await postRoute('bot-commands', bad, account), 400);
  }
  for (const chat of ['7', '-5', '-1001234']) {
    assert.equal(await postRoute('bot-commands', { chat }, account), 200);
  }
});

test('matchCommands: "/" lists all, words narrow, a space ends it', () => {
  const one = { command: 'start', description: 'Begin', username: 'a_bot' };
  const two = { command: 'stop', description: 'End', username: 'b_bot' };
  const three = { command: 'Help', description: 'Help', username: 'a_bot' };
  const all = [one, two, three];
  const names = (list) => list.map((c) => c.command);
  assert.deepEqual(names(matchCommands(all, '/')), ['start', 'stop', 'Help']);
  assert.deepEqual(names(matchCommands(all, '/st')), ['start', 'stop']);
  assert.deepEqual(names(matchCommands(all, '/sta')), ['start']);
  assert.deepEqual(names(matchCommands(all, '/he')), ['Help']);
  assert.deepEqual(matchCommands(all, '/zzz'), []);
  assert.deepEqual(matchCommands(all, 'hello'), []);
  assert.deepEqual(matchCommands(all, ' /st'), []);
  assert.deepEqual(matchCommands(all, '/start now'), []);
  assert.deepEqual(matchCommands(null, '/'), []);
  assert.equal(matchCommands(all, '/sta')[0].insert, '/start');
  assert.equal(
    matchCommands(all, '/sta', { group: true })[0].insert,
    '/start@a_bot'
  );
  assert.deepEqual(names(matchCommands(all, '/st@b', { group: true })), [
    'stop',
  ]);
  const nameless = { command: 'x', description: '', username: null };
  assert.equal(matchCommands([nameless], '/', { group: true })[0].insert, '/x');
});
