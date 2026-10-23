// Groups in common (R-Y158): the request built, Telegram's chats as marked
// ids with their kind and members, paging by the last chat's id, errors as
// codes, the route's validation and the page's pure helpers. Fake clients;
// nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  COMMON_PAGE,
  createCommonChats,
} from '../src/sources/telegram-common-chats.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  hasCommonChats,
  mergeCommon,
  targetOf,
} from '../src/web/chat-common-chats.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };
const Api = {
  messages: { GetCommonChats: named('GetCommonChats') },
  InputUser: named('InputUser'),
};

const make = (answer) => {
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
  const { commonChats } = createCommonChats(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ chat, userId: BigInt(chat), accessHash: 77n }),
      },
    },
    { userClient: async () => client }
  );
  return { commonChats, log };
};

const chat = (className, id, extra = {}) => ({
  className,
  id: BigInt(id),
  title: `T${id}`,
  ...extra,
});

test('chats become marked ids with kind and members', async () => {
  const { commonChats, log } = make(() => ({
    chats: [
      chat('Channel', 5, { megagroup: true, participantsCount: 120 }),
      chat('Channel', 6, { broadcast: true }),
      chat('Chat', 7, { participantsCount: 3 }),
      chat('ChatForbidden', 8),
    ],
  }));
  const answer = await commonChats({ chat: '42' });
  assert.deepEqual(answer, {
    ok: true,
    chats: [
      { chat: '-1005', title: 'T5', kind: 'group', members: 120 },
      { chat: '-1006', title: 'T6', kind: 'channel', members: null },
      { chat: '-7', title: 'T7', kind: 'group', members: 3 },
    ],
    next: null,
  });
  assert.equal(log[0].className, 'GetCommonChats');
  assert.equal(log[0].userId.userId, 42n);
  assert.equal(log[0].userId.accessHash, 77n);
  assert.equal(log[0].maxId, 0n);
  assert.equal(log[0].limit, COMMON_PAGE);
});

test('a full page offers the next, by the last chat id', async () => {
  const many = Array.from({ length: COMMON_PAGE }, (_, i) =>
    chat('Chat', 100 + i)
  );
  const { commonChats, log } = make(() => ({ chats: many }));
  const answer = await commonChats({ chat: '42', maxId: '9' });
  assert.equal(answer.next, String(100 + COMMON_PAGE - 1));
  assert.equal(log[0].maxId, 9n);
});

test('bad requests are refused and errors become codes', async () => {
  const { commonChats, log } = make(() =>
    Object.assign(new Error('x'), { errorMessage: 'USER_ID_INVALID' })
  );
  for (const body of [{}, { chat: '-5' }, { chat: '4', maxId: 'x' }]) {
    assert.equal((await commonChats(body)).ok, false);
  }
  assert.equal(log.length, 0);
  const failed = await commonChats({ chat: '42' });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'no-user');
});

const post = async (body, account) => {
  const path = '/api/telegram/common-chats';
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res.status;
};

test('the route validates strictly', async () => {
  const { commonChats } = make(() => ({ chats: [] }));
  const account = { commonChats };
  for (const bad of [
    {},
    { chat: 'me' },
    { chat: '-5' },
    { chat: '5', maxId: 'a' },
  ]) {
    assert.equal(await post(bad, account), 400);
  }
  assert.equal(await post({ chat: '5' }, account), 200);
  assert.equal(await post({ chat: '5', maxId: 12 }, account), 200);
});

test('page helpers: when the row shows, merging pages, the target', () => {
  const api = { telegramCommonChats: () => {} };
  const person = { source: 'telegram', chat: '42' };
  assert.equal(hasCommonChats(person, { commonChats: 2 }, api), true);
  assert.equal(hasCommonChats(person, { commonChats: 0 }, api), false);
  assert.equal(hasCommonChats(person, {}, api), false);
  assert.equal(
    hasCommonChats({ ...person, chat: '-5' }, { commonChats: 2 }, api),
    false
  );
  assert.equal(hasCommonChats(person, { commonChats: 2 }, {}), false);
  const a = { chat: '-1', title: 'A' };
  const b = { chat: '-2', title: 'B' };
  assert.deepEqual(mergeCommon([a], [a, b]), [a, b]);
  assert.deepEqual(targetOf({ chat: '-1006', title: 'C', kind: 'channel' }), {
    source: 'telegram',
    chat: '-1006',
    name: 'C',
    kind: 'channel',
  });
});
