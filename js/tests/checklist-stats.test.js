// Checklist extras, reaction reporting and the remaining statistics views
// (R-Y195): a new checklist and "Add tasks" with fake clients, reporting a
// reaction, a post's statistics, its public shares (paged) and the Stars
// revenue, the routes' strict validation and the page's pure helpers.
// Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPollActions } from '../src/sources/telegram-polls.js';
import { createReadersActions } from '../src/sources/telegram-readers.js';
import { createStats } from '../src/sources/telegram-stats.js';
import { starsOf } from '../src/sources/telegram-stats-more.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { named, postRoute } from './helpers/telegram-route.js';
import {
  TODO_LIMITS,
  canAppendTasks,
  parseTodo,
  taskProblem,
  tasksOf,
} from '../src/web/poll-parts.js';
import { changedTodo, todoBody } from '../src/web/chat-todo-create.js';
import { canReportReaction } from '../src/web/chat-readers.js';
import { hasMessageStats, postLink } from '../src/web/chat-message-stats.js';
import {
  formatStars,
  formatUsd,
  hasBotRevenue,
} from '../src/web/chat-stats.js';
import { menuItems } from '../src/web/chat-selection.js';
import { SEND_CALLS } from '../src/web/paid-send.js';

const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};

// ---- a new checklist and "Add tasks" ---------------------------------

const PollApi = {
  TodoList: named('TodoList'),
  TodoItem: named('TodoItem'),
  InputMediaTodo: named('InputMediaTodo'),
  TextWithEntities: named('TextWithEntities'),
  InputReplyToMessage: named('InputReplyToMessage'),
  messages: {
    SendMedia: named('messages.SendMedia'),
    AppendTodoList: named('messages.AppendTodoList'),
  },
};

const todoEnv = async ({ out = true, append = false, count = 3 } = {}) => {
  const store = createMemoryStore();
  await store.put({
    id: 'msg:telegram:-1001234:7',
    source: 'telegram',
    chat: '-1001234',
    raw: {
      id: 7,
      out,
      media: {
        className: 'MessageMediaToDo',
        todo: {
          othersCanAppend: append,
          list: Array.from({ length: count }, (_, i) => ({ id: (i + 1) * 2 })),
        },
      },
    },
  });
  await store.put({
    id: 'msg:telegram:-1001234:8',
    source: 'telegram',
    chat: '-1001234',
    raw: { id: 8, out: true, media: { className: 'MessageMediaPhoto' } },
  });
  const asked = [];
  const applied = [];
  const env = {
    store,
    importer: async () => ({ Api: PollApi, helpers }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
  };
  const actions = createPollActions(env, {
    userClient: async () => ({
      invoke: async (request) => {
        asked.push(request);
        return { className: 'Updates' };
      },
    }),
    apply: async (_client, result) => applied.push(result),
  });
  return { actions, asked, applied };
};

test('a new checklist: InputMediaTodo with numbered tasks and its switches', async () => {
  const { actions, asked, applied } = await todoEnv();
  const answer = await actions.sendTodo({
    chat: '-1001234',
    title: 'Trip',
    items: ['Tickets', 'Hotel'],
    othersCanAppend: true,
    othersCanComplete: false,
    clientId: 'c1',
    replyTo: 4,
  });
  assert.deepEqual(answer, { ok: true, chat: '-1001234' });
  assert.equal(asked[0].className, 'messages.SendMedia');
  const { todo } = asked[0].media;
  assert.equal(asked[0].media.className, 'InputMediaTodo');
  assert.equal(todo.title.text, 'Trip');
  assert.deepEqual(
    todo.list.map((i) => [i.id, i.title.text]),
    [
      [1, 'Tickets'],
      [2, 'Hotel'],
    ]
  );
  assert.equal(todo.othersCanAppend, true);
  assert.equal(todo.othersCanComplete, false);
  assert.equal(asked[0].message, '');
  assert.equal(applied.length, 1, "Telegram's answer reaches the handler");
  // No client: nothing is asked.
  const none = createPollActions(
    { store: createMemoryStore() },
    { userClient: async () => null, apply: async () => {} }
  );
  assert.equal((await none.sendTodo({ chat: '1' })).supported, false);
});

test('"Add tasks" continues the ids after the highest one', async () => {
  const { actions, asked, applied } = await todoEnv();
  const answer = await actions.appendTodo({
    chat: '-1001234',
    id: 7,
    items: ['  One ', 'Two'],
  });
  assert.deepEqual(answer, { ok: true, added: 2 });
  assert.equal(asked[0].className, 'messages.AppendTodoList');
  assert.equal(asked[0].msgId, 7);
  assert.deepEqual(
    asked[0].list.map((i) => [i.id, i.title.text]),
    [
      [7, 'One'],
      [8, 'Two'],
    ]
  );
  assert.equal(applied.length, 1);
});

test('"Add tasks" is refused for others, a full list and a non-checklist', async () => {
  const others = await todoEnv({ out: false });
  assert.equal(
    (await others.actions.appendTodo({ chat: '-1001234', id: 7, items: ['a'] }))
      .code,
    'not-allowed'
  );
  const open = await todoEnv({ out: false, append: true });
  assert.equal(
    (await open.actions.appendTodo({ chat: '-1001234', id: 7, items: ['a'] }))
      .ok,
    true,
    'others may add when the checklist lets them'
  );
  const full = await todoEnv({ count: 29 });
  assert.equal(
    (
      await full.actions.appendTodo({
        chat: '-1001234',
        id: 7,
        items: ['a', 'b'],
      })
    ).code,
    'too-many'
  );
  assert.equal(full.asked.length, 0, 'nothing asked');
  const other = await todoEnv();
  assert.equal(
    (await other.actions.appendTodo({ chat: '-1001234', id: 8, items: ['a'] }))
      .code,
    'not-a-todo'
  );
});

// ---- reporting a reaction ---------------------------------------------

const makeReaders = (fail = null) => {
  const log = [];
  const actions = createReadersActions(
    {
      importer: async () => ({
        Api: { messages: { ReportReaction: named('ReportReaction') } },
        helpers,
      }),
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
          return true;
        },
      }),
    }
  );
  return { ...actions, log };
};

test('a reaction is reported: the message and the member that reacted', async () => {
  const { reportReaction, log } = makeReaders();
  assert.deepEqual(await reportReaction({ chat: '-5', id: 9, peer: '31' }), {
    ok: true,
  });
  assert.equal(log[0].className, 'ReportReaction');
  assert.deepEqual(log[0].peer, { chat: '-5' });
  assert.deepEqual(log[0].reactionPeer, { chat: '31' });
  assert.equal(log[0].id, 9);
  // Bad input asks nothing.
  assert.equal(
    (await reportReaction({ chat: '-5', id: 9, peer: 'x' })).ok,
    false
  );
  assert.equal(log.length, 1);
  const denied = makeReaders('CHAT_ADMIN_REQUIRED');
  assert.equal(
    (await denied.reportReaction({ chat: '-5', id: 9, peer: '31' })).code,
    'not-allowed'
  );
});

// ---- a post's statistics, public shares, Stars revenue -----------------

const StatsApi = {
  channels: { GetFullChannel: named('GetFullChannel') },
  users: { GetFullUser: named('GetFullUser') },
  stats: {
    GetMessageStats: named('GetMessageStats'),
    GetMessagePublicForwards: named('GetMessagePublicForwards'),
    LoadAsyncGraph: named('LoadAsyncGraph'),
  },
  payments: { GetStarsRevenueStats: named('GetStarsRevenueStats') },
  InputUser: named('InputUser'),
};
const json = (text) => ({ className: 'StatsGraph', json: { data: text } });
const amount = (n, nanos = 0) => ({ amount: n, nanos });

const makeStats = (answers, { view = true, stars = true, dc = 4 } = {}) => {
  const log = [];
  const client = {
    session: { dcId: 2 },
    invoke: async (request, onDc) => {
      log.push({ name: request.className, request, dc: onDc });
      if (request.className === 'GetFullChannel') {
        return {
          fullChat: {
            canViewStats: view,
            canViewStarsRevenue: stars,
            statsDc: dc,
          },
          chats: [{ id: 5n, broadcast: true }],
        };
      }
      if (request.className === 'GetFullUser') {
        return { fullUser: { canViewRevenue: stars } };
      }
      const answer = answers[request.className];
      return typeof answer === 'function' ? answer(request) : answer;
    },
  };
  const stats = createStats(
    {
      importer: async () => ({ Api: StatsApi, helpers }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    { userClient: async () => client }
  );
  return { ...stats, log };
};

test('a post: the views and reactions graphs, on the stats DC', async () => {
  const { messageStats, log } = makeStats({
    GetMessageStats: {
      viewsGraph: json('{"v":1}'),
      reactionsByEmotionGraph: { className: 'StatsGraphAsync', token: 'tok' },
    },
  });
  const got = await messageStats({ chat: '-1001', id: 12 });
  assert.deepEqual(got, {
    ok: true,
    graphs: [
      { key: 'views', graph: { json: '{"v":1}' } },
      { key: 'reactions', graph: { token: 'tok' } },
    ],
  });
  const asked = log.find((l) => l.name === 'GetMessageStats');
  assert.equal(asked.request.msgId, 12);
  assert.equal(asked.dc, 4);
  const denied = makeStats({}, { view: false });
  assert.equal(
    (await denied.messageStats({ chat: '-1001', id: 12 })).code,
    'no-access'
  );
  assert.equal((await denied.messageStats({ chat: '5', id: 12 })).ok, false);
});

const forward = (channel, id, views) => ({
  className: 'PublicForwardMessage',
  message: {
    id,
    views,
    date: 1_700_000_000,
    message: 'Shared  text',
    peerId: { channelId: channel },
  },
});

test("public shares come a page at a time, with a link's parts", async () => {
  const pages = {
    '': {
      count: 3,
      forwards: [
        forward(7n, 21, 1500),
        { className: 'PublicForwardStory', peer: { channelId: 8n } },
      ],
      nextOffset: 'o2',
      chats: [
        { id: 7n, title: 'Fans', username: 'fans' },
        { id: 8n, title: 'Other' },
      ],
    },
    o2: {
      count: 3,
      forwards: [forward(9n, 5, 10)],
      chats: [{ id: 9n, title: 'Last' }],
    },
  };
  const { publicForwards, log } = makeStats({
    GetMessagePublicForwards: (request) => pages[request.offset],
  });
  const first = await publicForwards({ chat: '-1001', id: 12 });
  assert.equal(first.count, 3);
  assert.equal(first.next, 'o2');
  assert.deepEqual(first.items[0], {
    kind: 'message',
    name: 'Fans',
    chat: '-1007',
    id: 21,
    views: 1500,
    date: 1_700_000_000,
    text: 'Shared text',
    username: 'fans',
  });
  assert.deepEqual(first.items[1], {
    kind: 'story',
    name: 'Other',
    chat: '-1008',
  });
  const second = await publicForwards({ chat: '-1001', id: 12, offset: 'o2' });
  assert.equal(second.next, null);
  assert.equal(second.items[0].name, 'Last');
  const asked = log.filter((l) => l.name === 'GetMessagePublicForwards');
  assert.deepEqual(
    asked.map((l) => [l.request.offset, l.request.limit, l.request.msgId]),
    [
      ['', 20, 12],
      ['o2', 20, 12],
    ]
  );
  assert.equal(
    (await publicForwards({ chat: '-1001', id: 12, offset: 'x'.repeat(600) }))
      .ok,
    false
  );
});

test('Stars revenue: graph, balances, rate; only for who may see it', async () => {
  const revenue = {
    revenueGraph: { className: 'StatsGraphAsync', token: 'rev' },
    topHoursGraph: json('{"h":1}'),
    status: {
      currentBalance: amount(10),
      availableBalance: amount(7, 500_000_000),
      overallRevenue: amount(100),
      withdrawalEnabled: true,
    },
    usdRate: 0.013,
  };
  const channel = makeStats({ GetStarsRevenueStats: revenue });
  const got = await channel.starsRevenue({ chat: '-1001' });
  assert.deepEqual(got, {
    ok: true,
    graph: { token: 'rev' },
    topHours: { json: '{"h":1}' },
    status: {
      current: 10,
      available: 7.5,
      overall: 100,
      withdrawalEnabled: true,
    },
    usdRate: 0.013,
  });
  const bot = makeStats({ GetStarsRevenueStats: revenue });
  assert.equal((await bot.starsRevenue({ chat: '777' })).ok, true);
  assert.ok(bot.log.some((l) => l.name === 'GetFullUser'));
  const no = makeStats({ GetStarsRevenueStats: revenue }, { stars: false });
  assert.equal((await no.starsRevenue({ chat: '-1001' })).code, 'no-access');
  assert.equal(
    no.log.some((l) => l.name === 'GetStarsRevenueStats'),
    false
  );
  assert.equal((await no.starsRevenue({ chat: 'abc' })).ok, false);
  assert.equal(starsOf(amount(3, 250_000_000)), 3.25);
});

test("a bot's revenue graph token loads without a channel lookup", async () => {
  const { statsGraph, log } = makeStats({ LoadAsyncGraph: json('{"g":1}') });
  assert.deepEqual(await statsGraph({ chat: '777', token: 't' }), {
    ok: true,
    graph: { json: '{"g":1}' },
  });
  assert.equal(
    log.some((l) => l.name === 'GetFullChannel'),
    false
  );
});

// ---- the routes ---------------------------------------------------------

test('the routes validate strictly and reach the account only when valid', async () => {
  const seen = [];
  const note = (name) => async (body) => (
    seen.push([name, body]),
    { ok: true }
  );
  const account = {
    sendTodo: note('sendTodo'),
    appendTodo: note('appendTodo'),
    reportReaction: note('reportReaction'),
    messageStats: note('messageStats'),
    publicForwards: note('publicForwards'),
    starsRevenue: note('starsRevenue'),
  };
  const todo = {
    chat: '-1001',
    title: ' Trip ',
    items: [' A ', 'B'],
    othersCanAppend: true,
    othersCanComplete: false,
  };
  assert.equal(await postRoute('send-todo', todo, account), 200);
  assert.deepEqual(seen[0][1].items, ['A', 'B']);
  assert.equal(seen[0][1].title, 'Trip');
  assert.equal(
    await postRoute(
      'send-todo',
      { ...todo, sendAs: '-100', allowPaidStars: 5 },
      account
    ),
    200
  );
  assert.equal(seen[1][1].sendAs, '-100');
  for (const bad of [
    { ...todo, title: '' },
    { ...todo, title: 'x'.repeat(33) },
    { ...todo, items: [] },
    { ...todo, items: ['x'.repeat(65)] },
    { ...todo, items: Array(31).fill('a') },
    { ...todo, items: ['a', 3] },
    { ...todo, othersCanAppend: 'yes' },
    { ...todo, chat: 'abc' },
    { ...todo, scheduleDate: 5 },
  ]) {
    assert.equal(await postRoute('send-todo', bad, account), 400);
  }
  assert.equal(
    await postRoute(
      'todo-append',
      { chat: '-1001', id: 7, items: ['a'] },
      account
    ),
    200
  );
  for (const bad of [
    { chat: '-1001', id: 0, items: ['a'] },
    { chat: '-1001', id: 7, items: [] },
    { chat: '-1001', id: 7, items: ['x'.repeat(65)] },
    { chat: '-1001', id: 7, items: Array(31).fill('a') },
  ]) {
    assert.equal(await postRoute('todo-append', bad, account), 400);
  }
  assert.equal(
    await postRoute(
      'reaction-report',
      { chat: '-5', id: 9, peer: '31' },
      account
    ),
    200
  );
  assert.equal(
    await postRoute(
      'reaction-report',
      { chat: '-5', id: 9, peer: '-31' },
      account
    ),
    400
  );
  assert.equal(
    await postRoute('message-stats', { chat: '-1001', id: 3 }, account),
    200
  );
  assert.equal(
    await postRoute('message-stats', { chat: '-5', id: 3 }, account),
    400
  );
  assert.equal(
    await postRoute(
      'public-forwards',
      { chat: '-1001', id: 3, offset: 'o' },
      account
    ),
    200
  );
  assert.equal(
    await postRoute(
      'public-forwards',
      { chat: '-1001', id: 3, offset: 4 },
      account
    ),
    400
  );
  assert.equal(
    await postRoute('stars-revenue', { chat: '-1001' }, account),
    200
  );
  assert.equal(await postRoute('stars-revenue', { chat: '777' }, account), 200);
  assert.equal(await postRoute('stars-revenue', { chat: '-5' }, account), 400);
  assert.equal(
    await postRoute('send-todo', todo, {}),
    400,
    'no such account method'
  );
  assert.equal(seen.length, 8, 'bad bodies never reached the account');
});

test('stats-graph takes a bot id too', async () => {
  const account = { statsGraph: async () => ({ ok: true }) };
  assert.equal(
    await postRoute('stats-graph', { chat: '777', token: 't' }, account),
    200
  );
  assert.equal(
    await postRoute('stats-graph', { chat: '-5', token: 't' }, account),
    400
  );
});

// ---- the page's pure helpers --------------------------------------------

test('tasks are read one per line and checked against the limits', () => {
  assert.deepEqual(tasksOf('  a \n\n b\n   \n'), ['a', 'b']);
  assert.deepEqual(tasksOf(undefined), []);
  assert.equal(taskProblem([]), 'empty');
  assert.equal(taskProblem(['x'.repeat(65)]), 'long');
  assert.equal(taskProblem(['x'.repeat(64)]), null);
  assert.equal(taskProblem(['a', 'b'], 29), 'many');
  assert.equal(taskProblem(['a'], 29), null);
  assert.equal(TODO_LIMITS.items, 30);
});

test('"Add tasks" is offered to the author, or to all when allowed', () => {
  const media = { othersCanAppend: false, items: [{ id: 1 }] };
  assert.equal(canAppendTasks(media, true), true);
  assert.equal(canAppendTasks(media, false), false);
  assert.equal(
    canAppendTasks({ ...media, othersCanAppend: true }, false),
    true
  );
  const full = { othersCanAppend: true, items: Array(30).fill({ id: 1 }) };
  assert.equal(canAppendTasks(full, true), false);
});

test('a checklist shows who ticked a task and when', () => {
  const todo = parseTodo({
    todo: {
      title: { text: 'Trip' },
      list: [
        { id: 1, title: { text: 'A' } },
        { id: 2, title: { text: 'B' } },
      ],
    },
    completions: [{ id: 2, completedBy: { userId: 31n }, date: 1_700_000_000 }],
  });
  assert.deepEqual(
    todo.items.map((i) => [i.id, i.done, i.by, i.at]),
    [
      [1, false, null, null],
      [2, true, '31', 1_700_000_000_000],
    ]
  );
});

test('the new-checklist form: padded tasks, a body only when ready', () => {
  let form = {
    title: '',
    tasks: [{ id: 1, text: '' }],
    othersCanAppend: true,
    othersCanComplete: true,
  };
  assert.equal(todoBody(form), null);
  form = changedTodo(form, { title: ' Trip ' });
  assert.equal(todoBody(form), null, 'no task yet');
  form = changedTodo(form, { type: [1, ' Tickets '] });
  assert.equal(form.tasks.length, 2, 'an empty task follows a filled one');
  assert.deepEqual(todoBody(form), {
    title: 'Trip',
    items: ['Tickets'],
    othersCanAppend: true,
    othersCanComplete: true,
  });
  form = changedTodo(form, { othersCanAppend: false });
  assert.equal(todoBody(form).othersCanAppend, false);
  form = changedTodo(form, { drop: 1 });
  assert.equal(todoBody(form), null);
});

test('the checklist send goes through the paid-message gate like polls', () => {
  assert.ok(SEND_CALLS.includes('telegramSendTodo'));
});

test("a reaction can be reported by an admin of a group, not one's own", () => {
  const item = { peer: '31', my: false };
  const group = { kind: 'group', canBan: true };
  assert.equal(canReportReaction(group, item), true);
  assert.equal(
    canReportReaction({ kind: 'channel', canBan: true }, item),
    true
  );
  assert.equal(
    canReportReaction({ kind: 'channel', broadcast: true, canBan: true }, item),
    false,
    'not in a channel'
  );
  assert.equal(
    canReportReaction({ kind: 'group' }, item),
    false,
    'not an admin'
  );
  assert.equal(canReportReaction(group, { ...item, my: true }), false);
  assert.equal(canReportReaction(group, { peer: '-100', my: false }), false);
  assert.equal(canReportReaction(null, item), false);
});

test("a post's statistics: offered to an admin on a channel post; links", () => {
  const message = {
    source: 'telegram',
    chat: '-1001',
    id: 'msg:telegram:-1001:7',
    raw: { id: 7 },
  };
  const info = { broadcast: true, canViewStats: true };
  assert.equal(hasMessageStats(message, { chat: '-1001' }, info), true);
  assert.equal(
    hasMessageStats(message, { chat: '-1001' }, { broadcast: true }),
    false
  );
  assert.equal(
    hasMessageStats(message, { chat: '-1001' }, { canViewStats: true }),
    false
  );
  assert.equal(
    hasMessageStats({ ...message, pending: true }, { chat: '-1001' }, info),
    false
  );
  assert.equal(hasMessageStats(message, { chat: '-5' }, info), false);
  assert.ok(
    menuItems({ message, chat: { chat: '-1001' }, info }).includes(
      'messageStats'
    )
  );
  assert.ok(
    !menuItems({ message, chat: { chat: '-1001' }, info: {} }).includes(
      'messageStats'
    )
  );
  assert.equal(postLink({ id: 3, username: 'fans' }), 'https://t.me/fans/3');
  assert.equal(postLink({ id: 3, chat: '-1007' }), 'https://t.me/c/7/3');
  assert.equal(postLink({ chat: '-1007' }), null);
});

test('Stars revenue: who sees a bot entry; Stars and USD as text', () => {
  const api = { telegramStarsRevenue() {} };
  const chat = { source: 'telegram', chat: '777' };
  assert.equal(
    hasBotRevenue(chat, { bot: true, canViewStarsRevenue: true }, api),
    true
  );
  assert.equal(hasBotRevenue(chat, { bot: true }, api), false);
  assert.equal(
    hasBotRevenue(
      { ...chat, chat: '-1001' },
      { bot: true, canViewStarsRevenue: true },
      api
    ),
    false
  );
  assert.equal(
    hasBotRevenue(chat, { bot: true, canViewStarsRevenue: true }, {}),
    false
  );
  assert.equal(formatStars(1234.5, 'en'), '1,234.5');
  assert.equal(formatUsd(100, 0.013, 'en'), '$1.30');
  assert.equal(formatUsd(5, 0, 'en'), '$0.00');
});
