// Creating a poll (R-Y74): the request built for a plain poll, a poll of
// many answers and a quiz, Telegram's answer sent to the live handler,
// errors named as other sends name them, and the route refusing bad
// bodies. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createPollActions } from '../src/sources/telegram-polls.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { pollBody } from '../src/web/chat-poll-create.js';

const tl = (className) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { className });
    }
  };
const Api = {
  Poll: tl('Poll'),
  InputPollAnswer: tl('InputPollAnswer'),
  TextWithEntities: tl('TextWithEntities'),
  InputMediaPoll: tl('InputMediaPoll'),
  InputReplyToMessage: tl('InputReplyToMessage'),
  messages: { SendMedia: tl('messages.SendMedia') },
};
const helpers = {
  returnBigInt: (v) => BigInt(v),
  readBigIntFromBuffer: (b) => b.readBigInt64LE(0),
};

const setup = ({ fail = null } = {}) => {
  const asked = [];
  const applied = [];
  const changed = [];
  const client = {
    invoke: async (request) => {
      asked.push(request);
      if (fail) {
        throw fail;
      }
      return { className: 'Updates' };
    },
  };
  const env = {
    store: createMemoryStore(),
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
    actions: { scheduledChanged: (chat) => changed.push(chat) },
  };
  const actions = createPollActions(env, {
    userClient: async () => client,
    apply: async (_client, result) => applied.push(result),
  });
  return { actions, asked, applied, changed };
};

const answersOf = (media) =>
  media.poll.answers.map((a) => [a.text.text, a.className, a.option]);

test('a plain poll: anonymous, one answer, answers as Telegram names new ones', async () => {
  const { actions, asked, applied } = setup();
  const done = await actions.sendPoll({
    chat: '-1001234',
    question: 'Lunch?',
    options: ['Soup', 'Salad'],
    anonymous: true,
    multiple: false,
    quiz: false,
    clientId: 'c1',
  });
  assert.deepEqual(done, { ok: true, chat: '-1001234' });
  const [request] = asked;
  assert.equal(request.className, 'messages.SendMedia');
  assert.deepEqual(request.peer, { peer: '-1001234' });
  assert.equal(request.message, '');
  assert.equal(typeof request.randomId, 'bigint');
  assert.equal(request.media.className, 'InputMediaPoll');
  const { poll } = request.media;
  assert.equal(poll.question.className, 'TextWithEntities');
  assert.equal(poll.question.text, 'Lunch?');
  assert.deepEqual(poll.question.entities, []);
  assert.deepEqual(answersOf(request.media), [
    ['Soup', 'InputPollAnswer', undefined],
    ['Salad', 'InputPollAnswer', undefined],
  ]);
  assert.equal(poll.publicVoters, false);
  assert.equal(poll.multipleChoice, false);
  assert.equal(poll.quiz, false);
  assert.equal(request.media.correctAnswers, undefined);
  assert.equal(request.silent, undefined);
  assert.equal(request.replyTo, undefined);
  // Telegram's answer goes through the live handler.
  assert.equal(applied.length, 1);
});

test('the same draft keeps the same random id; another does not', async () => {
  const { actions, asked } = setup();
  const draft = {
    chat: '1',
    question: 'Q',
    options: ['a', 'b'],
    anonymous: true,
    multiple: false,
    quiz: false,
  };
  await actions.sendPoll({ ...draft, clientId: 'same' });
  await actions.sendPoll({ ...draft, clientId: 'same' });
  await actions.sendPoll({ ...draft, clientId: 'other' });
  assert.equal(asked[0].randomId, asked[1].randomId);
  assert.notEqual(asked[0].randomId, asked[2].randomId);
});

test('a public poll of many answers, silent, an answer, scheduled', async () => {
  const { actions, asked, changed } = setup();
  const done = await actions.sendPoll({
    chat: '42',
    question: 'Toppings?',
    options: ['Cheese', 'Ham', 'Olives'],
    anonymous: false,
    multiple: true,
    quiz: false,
    replyTo: 9,
    silent: true,
    scheduleDate: 1_900_000_000,
  });
  assert.deepEqual(done, { ok: true, chat: '42', scheduled: true });
  assert.deepEqual(changed, ['42']);
  const [request] = asked;
  assert.equal(request.media.poll.publicVoters, true);
  assert.equal(request.media.poll.multipleChoice, true);
  assert.equal(request.media.poll.answers.length, 3);
  assert.equal(request.silent, true);
  assert.equal(request.scheduleDate, 1_900_000_000);
  assert.equal(request.replyTo.replyToMsgId, 9);
});

test('a quiz names its right answer and its explanation', async () => {
  const { actions, asked } = setup();
  await actions.sendPoll({
    chat: '42',
    question: '2 + 2?',
    options: ['3', '4', '5'],
    anonymous: true,
    multiple: false,
    quiz: true,
    correct: 1,
    solution: 'Count again.',
  });
  const { media } = asked[0];
  assert.equal(media.poll.quiz, true);
  assert.equal(media.poll.multipleChoice, false);
  assert.deepEqual(media.correctAnswers, [1]);
  assert.equal(media.solution, 'Count again.');
  assert.deepEqual(media.solutionEntities, []);
  // Without an explanation, none is sent.
  await actions.sendPoll({
    chat: '42',
    question: '2 + 2?',
    options: ['3', '4'],
    anonymous: true,
    multiple: false,
    quiz: true,
    correct: 0,
  });
  assert.equal(asked[1].media.solution, undefined);
});

test("Telegram's errors are named as other sends name them", async () => {
  const flood = setup({
    fail: Object.assign(new Error('x'), {
      errorMessage: 'FLOOD_WAIT_7',
      seconds: 7,
    }),
  });
  await assert.rejects(
    flood.actions.sendPoll({
      chat: '1',
      question: 'Q',
      options: ['a', 'b'],
      anonymous: true,
      multiple: false,
      quiz: false,
    }),
    { code: 'flood-wait', retryAfter: 7 }
  );
  const closed = setup({
    fail: Object.assign(new Error('x'), {
      errorMessage: 'CHAT_SEND_POLL_FORBIDDEN CHAT_WRITE_FORBIDDEN',
    }),
  });
  await assert.rejects(
    closed.actions.sendPoll({
      chat: '1',
      question: 'Q',
      options: ['a', 'b'],
      anonymous: true,
      multiple: false,
      quiz: false,
    }),
    { code: 'write-forbidden' }
  );
  // No client (a bot, not connected): nothing is asked.
  const none = createPollActions(
    { store: createMemoryStore() },
    { userClient: async () => null, apply: async () => {} }
  );
  assert.equal((await none.sendPoll({ chat: '1' })).supported, false);
});

const call = async (body, account) => {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = '/api/telegram/send-poll';
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
    'sec-fetch-site': 'same-origin',
  };
  const res = {
    headers: {},
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end(text) {
      this.body = text;
    },
  };
  await handleTelegramRoutes(req, res, '/api/telegram/send-poll', {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

const GOOD = {
  chat: '-1001234',
  question: 'Lunch?',
  options: ['Soup', 'Salad'],
  anonymous: true,
  multiple: false,
  quiz: false,
};

test('the route sends a good poll and refuses bad bodies', async () => {
  const seen = [];
  const account = {
    sendPoll: async (draft) => {
      seen.push(draft);
      return { ok: true };
    },
  };
  const ok = await call(
    { ...GOOD, question: ' Lunch? ', replyTo: 5, silent: true, clientId: 'a' },
    account
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(seen[0], {
    chat: '-1001234',
    question: 'Lunch?',
    options: ['Soup', 'Salad'],
    anonymous: true,
    multiple: false,
    quiz: false,
    replyTo: 5,
    clientId: 'a',
    silent: true,
  });
  const quiz = await call(
    {
      ...GOOD,
      options: ['a', 'b', 'c'],
      quiz: true,
      correct: 2,
      solution: 'because',
    },
    account
  );
  assert.equal(quiz.status, 200);
  assert.equal(seen[1].correct, 2);
  assert.equal(seen[1].solution, 'because');

  const many = Array.from({ length: 11 }, (_, i) => `o${i}`);
  const bad = [
    { ...GOOD, chat: 'abc' },
    { ...GOOD, chat: undefined },
    { ...GOOD, question: '' },
    { ...GOOD, question: '   ' },
    { ...GOOD, question: 'q'.repeat(256) },
    { ...GOOD, question: 5 },
    { ...GOOD, options: ['only'] },
    { ...GOOD, options: many },
    { ...GOOD, options: ['a', ''] },
    { ...GOOD, options: ['a', 'x'.repeat(101)] },
    { ...GOOD, options: ['a', 3] },
    { ...GOOD, options: 'ab' },
    { ...GOOD, anonymous: undefined },
    { ...GOOD, multiple: 'yes' },
    { ...GOOD, quiz: 1 },
    // A quiz: needs a right answer in range, and no multiple answers.
    { ...GOOD, quiz: true },
    { ...GOOD, quiz: true, correct: 2 },
    { ...GOOD, quiz: true, correct: -1 },
    { ...GOOD, quiz: true, correct: 0.5 },
    { ...GOOD, quiz: true, correct: '0' },
    { ...GOOD, quiz: true, correct: 0, multiple: true },
    { ...GOOD, quiz: true, correct: 0, solution: 's'.repeat(201) },
    { ...GOOD, quiz: true, correct: 0, solution: 7 },
    // Not a quiz: no right answer, no explanation.
    { ...GOOD, correct: 0 },
    { ...GOOD, solution: 'why' },
    { ...GOOD, silent: 'yes' },
    { ...GOOD, scheduleDate: 'soon' },
  ];
  for (const body of bad) {
    const res = await call(body, account);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 120));
    assert.equal(JSON.parse(res.body).code, 'bad-request');
  }
  assert.equal(seen.length, 2, 'nothing bad reached the account');
  // An account that cannot send polls (a bot): refused too.
  assert.equal((await call(GOOD, {})).status, 400);
});

test('the page builds the body: filled options only, a quiz needs its mark', () => {
  const opt = (id, text) => ({ id, text });
  const form = {
    question: ' Lunch? ',
    options: [opt(1, ' Soup '), opt(2, ''), opt(3, 'Salad'), opt(4, '')],
    anonymous: true,
    multiple: true,
    quiz: false,
    correct: null,
    solution: '',
  };
  assert.deepEqual(pollBody(form), {
    question: 'Lunch?',
    options: ['Soup', 'Salad'],
    anonymous: true,
    multiple: true,
    quiz: false,
  });
  assert.equal(pollBody({ ...form, question: ' ' }), null);
  assert.equal(pollBody({ ...form, options: [opt(1, 'Soup')] }), null);
  const quiz = { ...form, quiz: true };
  assert.equal(pollBody(quiz), null, 'a quiz needs a right option');
  assert.deepEqual(pollBody({ ...quiz, correct: 3, solution: ' why ' }), {
    question: 'Lunch?',
    options: ['Soup', 'Salad'],
    anonymous: true,
    multiple: false,
    quiz: true,
    correct: 1,
    solution: 'why',
  });
});
