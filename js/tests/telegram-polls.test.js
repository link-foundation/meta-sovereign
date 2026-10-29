// Polls, quizzes and checklists as Telegram's apps have them (R-Y74):
// what a poll update writes, voting, taking a vote back, stopping a
// poll, who voted for what, ticking a checklist, the routes, the menu,
// and how a poll is drawn before and after voting. Synthetic data and
// fakes only — no network, no running app, no real account.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { updateEffect } from '../src/sources/telegram-updates.js';
import {
  createPollActions,
  mergePollResults,
  pollWriter,
} from '../src/sources/telegram-polls.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createRawPacking } from '../src/storage/raw-packing.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  canRetract,
  canStop,
  nicePercents,
  parsePoll,
  parseTodo,
  showsResults,
} from '../src/web/poll-parts.js';
import { parseMedia } from '../src/web/message-parts.js';
import { Checklist, Poll, pollKindKey } from '../src/web/chat-poll.js';
import { menuItems } from '../src/web/chat-selection.js';
import { mediaLabel } from '../src/web/chat-message.js';
import { LocaleContext, translate } from '../src/web/i18n.js';

const A = Buffer.from('0').toString('base64'); // "MA=="
const B = Buffer.from('1').toString('base64'); // "MQ=="
const C = Buffer.from('2').toString('base64');

const text = (t) => ({ className: 'TextWithEntities', text: t, entities: [] });

const storedPoll = (extra = {}, results = {}) => ({
  className: 'MessageMediaPoll',
  poll: {
    className: 'Poll',
    id: '5000000000000000001',
    question: text('Lunch?'),
    answers: [
      { className: 'PollAnswer', text: text('Soup'), option: { bytes: A } },
      { className: 'PollAnswer', text: text('Salad'), option: { bytes: B } },
      { className: 'PollAnswer', text: text('Both'), option: { bytes: C } },
    ],
    hash: '77',
    ...extra,
  },
  results: { className: 'PollResults', ...results },
});

const pollMessage = (chat, id, media, extra = {}) => ({
  id: `msg:telegram:${chat}:${id}`,
  source: 'telegram',
  chat,
  sender: 'u1',
  body: '',
  timestamp: '2026-10-21T12:00:00.000Z',
  raw: { id, media, ...extra },
});

test('a poll update names the poll, by message or by poll id', () => {
  const effect = updateEffect({
    className: 'UpdateMessagePoll',
    peer: { className: 'PeerChannel', channelId: '1234' },
    msgId: 7,
    pollId: 5000000000000000001n,
    results: {
      className: 'PollResults',
      min: true,
      totalVoters: 3,
      results: [{ option: Buffer.from('0'), voters: 3 }],
    },
  });
  assert.equal(effect.kind, 'poll');
  assert.equal(effect.chat, '-1001234');
  assert.equal(effect.id, 7);
  assert.equal(effect.pollId, '5000000000000000001');
  assert.equal(effect.results.results[0].option.bytes, A);
  // Older layers say only the poll.
  const bare = updateEffect({
    className: 'UpdateMessagePoll',
    pollId: '9',
    results: {},
  });
  assert.equal(bare.chat, null);
  assert.equal(bare.pollId, '9');
});

test('counts-only results keep our vote and the right answer', () => {
  const before = {
    totalVoters: 2,
    results: [
      { option: { bytes: A }, voters: 1, chosen: true, correct: true },
      { option: { bytes: B }, voters: 1 },
    ],
    solution: 'Soup is warm',
  };
  const next = {
    min: true,
    totalVoters: 3,
    results: [
      { option: { bytes: A }, voters: 2 },
      { option: { bytes: B }, voters: 1 },
    ],
  };
  const merged = mergePollResults(before, next);
  assert.equal(merged.totalVoters, 3);
  assert.equal(merged.results[0].voters, 2);
  assert.equal(merged.results[0].chosen, true);
  assert.equal(merged.results[0].correct, true);
  assert.equal(merged.solution, 'Soup is warm');
  // Full results are Telegram's word, our vote taken back included.
  const full = { totalVoters: 2, results: [{ option: { bytes: A } }] };
  assert.equal(mergePollResults(before, full), full);
  assert.equal(mergePollResults(before, null), before);
});

test('the poll writer finds the poll by message, else by its id', async () => {
  const store = createMemoryStore();
  await store.put(pollMessage('-1001234', 7, storedPoll()));
  await store.put(pollMessage('42', 3, storedPoll({ id: '6' })));
  const results = {
    totalVoters: 1,
    results: [{ option: { bytes: B }, voters: 1, chosen: true }],
  };
  assert.equal(
    await pollWriter(store, { chat: '-1001234', id: 7, results }),
    true
  );
  const got = await store.get('msg:telegram:-1001234:7');
  assert.equal(got.raw.media.results.results[0].chosen, true);
  // The same results again change nothing.
  assert.equal(
    await pollWriter(store, { chat: '-1001234', id: 7, results }),
    false
  );
  // By poll id only (the message is not named).
  assert.equal(
    await pollWriter(store, { chat: null, id: null, pollId: '6', results }),
    true
  );
  const other = await store.get('msg:telegram:42:3');
  assert.equal(other.raw.media.results.totalVoters, 1);
  // A closed poll comes with the poll.
  await pollWriter(store, {
    chat: '42',
    id: 3,
    poll: { ...other.raw.media.poll, closed: true },
    results,
  });
  assert.equal(
    (await store.get('msg:telegram:42:3')).raw.media.poll.closed,
    true
  );
});

test('an unnamed poll update never decodes unrelated archived media', async () => {
  const packing = createRawPacking();
  const store = createMemoryStore({
    retain: packing.retain,
    release: packing.release,
    copy: packing.copy,
  });
  const photo = packing.pack({
    id: 'msg:telegram:42:1',
    source: 'telegram',
    raw: {
      media: { className: 'MessageMediaPhoto', caption: 'large '.repeat(100) },
    },
  });
  Object.defineProperty(photo, 'raw', {
    enumerable: true,
    configurable: true,
    get() {
      return assert.fail('a poll lookup expanded an unrelated cold payload');
    },
  });
  await store.put(photo);
  await store.put(pollMessage('42', 3, storedPoll({ id: '6' })));
  assert.equal(
    await pollWriter(store, {
      pollId: '6',
      results: { totalVoters: 7, results: [] },
    }),
    true
  );
  assert.equal(
    (await store.get('msg:telegram:42:3')).raw.media.results.totalVoters,
    7
  );
});

// GramJS's TL classes, as plain records of what was asked.
const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };
const Api = {
  Poll: tl('Poll'),
  PollAnswer: tl('PollAnswer'),
  TextWithEntities: tl('TextWithEntities'),
  InputMediaPoll: tl('InputMediaPoll'),
  messages: {
    SendVote: tl('messages.SendVote'),
    EditMessage: tl('messages.EditMessage'),
    GetPollResults: tl('messages.GetPollResults'),
    GetPollVotes: tl('messages.GetPollVotes'),
    ToggleTodoCompleted: tl('messages.ToggleTodoCompleted'),
  },
};
const helpers = { returnBigInt: (v) => BigInt(v) };

const pollEnv = async (answers = {}) => {
  const store = createMemoryStore();
  await store.put(pollMessage('-1001234', 7, storedPoll()));
  const asked = [];
  const applied = [];
  const client = {
    invoke: async (request) => {
      asked.push(request);
      return answers[request.className] ?? { className: 'Updates' };
    },
  };
  const env = {
    store,
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
  };
  const actions = createPollActions(env, {
    userClient: async () => client,
    apply: async (_client, result) => applied.push(result),
  });
  return { actions, asked, applied, store };
};

test('a vote names its answers as bytes; no answers takes it back', async () => {
  const { actions, asked, applied } = await pollEnv();
  assert.deepEqual(
    await actions.votePoll({ chat: '-1001234', id: 7, options: [B] }),
    { ok: true, voted: 1, retracted: false }
  );
  assert.equal(asked[0].className, 'messages.SendVote');
  assert.equal(asked[0].msgId, 7);
  assert.deepEqual(asked[0].peer, { peer: '-1001234' });
  assert.equal(asked[0].options[0].toString(), '1');
  // Telegram's answer goes through the live handler.
  assert.equal(applied.length, 1);
  const back = await actions.votePoll({ chat: '-1001234', id: 7, options: [] });
  assert.equal(back.retracted, true);
  assert.deepEqual(asked[1].options, []);
  // No client (a bot, not connected): nothing is asked.
  const none = createPollActions(
    { store: createMemoryStore() },
    { userClient: async () => null, apply: async () => {} }
  );
  assert.equal((await none.votePoll({ chat: '1', id: 2 })).supported, false);
});

test('stopping a poll sends it back closed, as it is', async () => {
  const { actions, asked } = await pollEnv();
  assert.deepEqual(await actions.stopPoll({ chat: '-1001234', id: 7 }), {
    ok: true,
    stopped: 7,
  });
  const edit = asked[0];
  assert.equal(edit.className, 'messages.EditMessage');
  const poll = edit.media.poll;
  assert.equal(edit.media.className, 'InputMediaPoll');
  assert.equal(poll.closed, true);
  assert.equal(poll.id, 5000000000000000001n);
  assert.equal(poll.hash, 77n);
  assert.equal(poll.question.text, 'Lunch?');
  assert.deepEqual(
    poll.answers.map((a) => [a.text.text, a.option.toString()]),
    [
      ['Soup', '0'],
      ['Salad', '1'],
      ['Both', '2'],
    ]
  );
  // Not a poll: nothing is sent.
  assert.equal(
    (await actions.stopPoll({ chat: '-1001234', id: 99 })).code,
    'not-a-poll'
  );
});

test('results are asked by the poll hash; voters come with their names', async () => {
  const { actions, asked } = await pollEnv({
    'messages.GetPollVotes': {
      count: 2,
      nextOffset: 'next',
      votes: [
        {
          className: 'MessagePeerVote',
          peer: { className: 'PeerUser', userId: '11' },
          option: Buffer.from('1'),
          date: 1700000000,
        },
        {
          className: 'MessagePeerVoteMultiple',
          peer: { className: 'PeerUser', userId: '12' },
          options: [Buffer.from('0'), Buffer.from('2')],
          date: 1700000001,
        },
      ],
      users: [
        { id: '11', firstName: 'Ann', lastName: 'Lee' },
        { id: '12', username: 'bob' },
      ],
      chats: [],
    },
  });
  await actions.pollResults({ chat: '-1001234', id: 7 });
  assert.equal(asked[0].className, 'messages.GetPollResults');
  assert.equal(asked[0].pollHash, 77n);
  const votes = await actions.pollVotes({
    chat: '-1001234',
    id: 7,
    option: B,
    limit: 500,
  });
  assert.equal(asked[1].limit, 100);
  assert.equal(asked[1].option.toString(), '1');
  assert.deepEqual(votes, {
    ok: true,
    count: 2,
    nextOffset: 'next',
    votes: [
      { peer: '11', name: 'Ann Lee', options: [B], date: 1700000000 },
      { peer: '12', name: '@bob', options: [A, C], date: 1700000001 },
    ],
  });
});

test('a checklist task is ticked or unticked by its id', async () => {
  const { actions, asked } = await pollEnv();
  await actions.toggleTodo({
    chat: '-1001234',
    id: 7,
    completed: [2, -1, 'x'],
    incompleted: [3],
  });
  assert.equal(asked[0].className, 'messages.ToggleTodoCompleted');
  assert.deepEqual(asked[0].completed, [2]);
  assert.deepEqual(asked[0].incompleted, [3]);
});

const fakeResponse = () => ({
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  writeHead(status, headers = {}) {
    this.status = status;
    Object.assign(this.headers, headers);
  },
  end(body) {
    this.body = body;
  },
});

const post = async (account, name, body) => {
  const res = fakeResponse();
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = `/api/telegram/${name}`;
  req.headers = { 'content-type': 'application/json' };
  await handleTelegramRoutes(req, res, req.url, { telegramAccount: account });
  return { status: res.status, body: JSON.parse(res.body) };
};

test('the poll routes check what they are given', async () => {
  const calls = [];
  const account = {
    status: async () => ({}),
    votePoll: async (r) => (calls.push(['vote', r]), { ok: true }),
    stopPoll: async (r) => (calls.push(['stop', r]), { ok: true }),
    pollVotes: async (r) => (calls.push(['votes', r]), { ok: true }),
    toggleTodo: async (r) => (calls.push(['todo', r]), { ok: true }),
  };
  const ok = await post(account, 'poll-vote', {
    chat: '-1001234',
    id: 7,
    options: [A, B],
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0], [
    'vote',
    { chat: '-1001234', id: 7, options: [A, B] },
  ]);
  // Retract: no options.
  assert.equal(
    (await post(account, 'poll-vote', { chat: '1', id: 2, options: [] }))
      .status,
    200
  );
  for (const [name, body] of [
    ['poll-vote', { chat: '1', id: 2, options: ['not base64!'] }],
    ['poll-vote', { chat: '1', id: 2 }],
    ['poll-stop', { chat: '1', id: 0 }],
    ['poll-votes', { chat: '1', id: 2, option: 5 }],
    ['todo-toggle', { chat: '1', id: 2 }],
    ['todo-toggle', { chat: '1', id: 2, completed: [0] }],
    ['poll-results', { chat: '1', id: 2 }], // the account cannot
  ]) {
    assert.equal((await post(account, name, body)).status, 400, name);
  }
  await post(account, 'todo-toggle', { chat: '1', id: 2, completed: [4] });
  assert.deepEqual(calls.at(-1), [
    'todo',
    { chat: '1', id: 2, completed: [4], incompleted: [] },
  ]);
});

test('shares are whole percents adding up to 100, as Desktop shows', () => {
  assert.deepEqual(nicePercents([1, 1, 1], 3), [34, 33, 33]);
  assert.deepEqual(nicePercents([2, 1], 3), [67, 33]);
  assert.deepEqual(nicePercents([0, 0], 0), [0, 0]);
  // Several answers each: each against the voters, not to 100.
  assert.deepEqual(nicePercents([2, 2], 2), [100, 100]);
});

test('a poll is read with our vote, the right answer and its kind', () => {
  const media = storedPoll(
    { quiz: true, publicVoters: true, closeDate: 1700000600 },
    {
      totalVoters: 4,
      results: [
        { option: { bytes: A }, voters: 1, chosen: true },
        { option: { bytes: B }, voters: 3, correct: true },
      ],
      recentVoters: [
        { className: 'PeerUser', userId: '11' },
        { className: 'PeerChannel', channelId: '9' },
      ],
      solution: 'Salad is lighter',
    }
  );
  const poll = parseMedia({ media });
  assert.equal(poll.kind, 'poll');
  assert.equal(poll.question, 'Lunch?');
  assert.equal(poll.voted, true);
  assert.deepEqual(
    poll.answers.map((a) => [a.option, a.voters, a.chosen, a.correct]),
    [
      [A, 1, true, false],
      [B, 3, false, true],
      [C, null, false, false],
    ]
  );
  assert.deepEqual(poll.recentVoters, ['11', '-1009']);
  assert.equal(poll.closeDate, 1700000600);
  assert.equal(poll.solution, 'Salad is lighter');
  assert.equal(pollKindKey(poll), 'chat.poll.quiz');
  assert.equal(
    pollKindKey({ ...poll, quiz: false, publicVoters: false }),
    'chat.poll.anonymous'
  );
  assert.equal(pollKindKey({ ...poll, closed: true }), 'chat.poll.final');
  assert.equal(showsResults(poll), true);
  // A quiz's vote is final.
  assert.equal(canRetract(poll), false);
  assert.equal(canRetract({ ...poll, quiz: false }), true);
  assert.equal(
    canRetract({ ...poll, quiz: false, revotingDisabled: true }),
    false
  );
  // Results hidden until it closes.
  assert.equal(showsResults({ ...poll, hideResultsUntilClose: true }), false);
  assert.equal(
    showsResults({ ...poll, hideResultsUntilClose: true, closed: true }),
    true
  );
  assert.equal(showsResults(parsePoll(storedPoll())), false);
});

test('only the poll’s author may stop it, while it is open', () => {
  const poll = parsePoll(storedPoll());
  const mine = pollMessage('42', 3, storedPoll(), { out: true });
  assert.equal(canStop(poll, mine), true);
  assert.equal(canStop(poll, pollMessage('42', 3, storedPoll())), false);
  assert.equal(
    canStop({ ...poll, creator: true }, pollMessage('42', 3, storedPoll())),
    true
  );
  assert.equal(canStop({ ...poll, closed: true }, mine), false);
  assert.equal(canStop(poll, { ...mine, pending: true }), false);
});

test('the menu offers Retract vote and Stop poll where Desktop does', () => {
  const chat = { chat: '42', personal: true, kind: 'personal' };
  const voted = storedPoll(
    {},
    {
      totalVoters: 1,
      results: [{ option: { bytes: A }, voters: 1, chosen: true }],
    }
  );
  const items = menuItems({
    message: pollMessage('42', 3, voted, { out: true }),
    chat,
    info: {},
    now: Date.parse('2026-10-21T12:01:00Z'),
  });
  assert.ok(items.includes('retractVote'));
  assert.ok(items.includes('stopPoll'));
  assert.ok(items.indexOf('stopPoll') < items.indexOf('forward'));
  const theirs = menuItems({
    message: pollMessage('42', 4, storedPoll()),
    chat,
    info: {},
    now: Date.parse('2026-10-21T12:01:00Z'),
  });
  assert.ok(!theirs.includes('retractVote'));
  assert.ok(!theirs.includes('stopPoll'));
});

const render = (element, locale = 'en') =>
  renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      {
        value: {
          locale,
          setLocale: () => {},
          t: (key, vars) => translate(locale, key, vars),
        },
      },
      element
    )
  );

const api = { telegramPoll: async () => ({ ok: true }) };

test('before voting: a circle per answer; after: shares, bars and a tick', () => {
  const open = render(
    React.createElement(Poll, {
      media: parsePoll(storedPoll()),
      api,
      chat: '42',
      msgId: 3,
    })
  );
  assert.match(open, /Anonymous Poll/);
  assert.equal((open.match(/role="radio"/g) ?? []).length, 3);
  assert.match(open, /No votes/);
  assert.doesNotMatch(open, /%/);

  const several = render(
    React.createElement(Poll, {
      media: parsePoll(storedPoll({ multipleChoice: true })),
      api,
      chat: '42',
      msgId: 3,
    })
  );
  assert.equal((several.match(/role="checkbox"/g) ?? []).length, 3);
  assert.match(several, />Vote</);

  const voted = render(
    React.createElement(Poll, {
      media: parsePoll(
        storedPoll(
          { publicVoters: true },
          {
            totalVoters: 3,
            results: [
              { option: { bytes: A }, voters: 1, chosen: true },
              { option: { bytes: B }, voters: 1 },
              { option: { bytes: C }, voters: 1 },
            ],
          }
        )
      ),
      api,
      chat: '42',
      msgId: 3,
    }),
    'ru'
  );
  assert.match(voted, />34%</);
  assert.equal((voted.match(/>33%</g) ?? []).length, 2);
  assert.match(voted, /poll-answer chosen/);
  assert.match(voted, /Результаты/);
  assert.doesNotMatch(voted, /role="radio"/);

  const quiz = render(
    React.createElement(Poll, {
      media: parsePoll(
        storedPoll(
          { quiz: true, closed: true },
          {
            totalVoters: 2,
            results: [
              { option: { bytes: A }, voters: 1, chosen: true },
              { option: { bytes: B }, voters: 1, correct: true },
            ],
          }
        )
      ),
      api,
      chat: '42',
      msgId: 3,
    })
  );
  assert.match(quiz, /Final results/);
  assert.match(quiz, /poll-answer chosen wrong/);
  assert.match(quiz, /poll-answer correct/);
  assert.match(quiz, /2 answers/);
});

test('a checklist shows its tasks, ticked by who did them', () => {
  const media = parseMedia({
    media: {
      className: 'MessageMediaToDo',
      todo: {
        className: 'TodoList',
        othersCanComplete: true,
        title: text('Trip'),
        list: [
          { className: 'TodoItem', id: 1, title: text('Tickets') },
          { className: 'TodoItem', id: 2, title: text('Hotel') },
        ],
      },
      completions: [
        {
          className: 'TodoCompletion',
          id: 1,
          completedBy: { className: 'PeerUser', userId: '11' },
          date: 1700000000,
        },
      ],
    },
  });
  assert.deepEqual(media, {
    kind: 'todo',
    title: 'Trip',
    othersCanAppend: false,
    othersCanComplete: true,
    items: [
      { id: 1, text: 'Tickets', done: true, by: '11', at: 1700000000000 },
      { id: 2, text: 'Hotel', done: false, by: null, at: null },
    ],
  });
  assert.deepEqual(parseTodo(null).items, []);
  const html = render(
    React.createElement(Checklist, { media, api, chat: '42', msgId: 3 })
  );
  assert.match(html, /Checklist/);
  assert.match(html, /1 of 2 completed/);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
  const t = (key) => translate('en', key);
  assert.equal(mediaLabel(t, media), '☑️ Trip');
});
