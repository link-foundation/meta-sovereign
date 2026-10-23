// A chat's shared media (R-Y111): Telegram's counters read for each
// kind, a kind's messages asked with its filter a page at a time and
// stored; the route refuses what is not a chat or a kind; the links in a
// message's text, each once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  SHARED_KINDS,
  SHARED_PAGE,
  createSharedMedia,
} from '../src/sources/telegram-shared.js';
import { linksIn, SHARED_ORDER } from '../src/web/chat-shared.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const fakeApi = () => {
  const Api = { messages: {} };
  Api.messages.GetSearchCounters = class {
    constructor(args) {
      Object.assign(this, args);
    }
  };
  for (const name of Object.values(SHARED_KINDS)) {
    Api[name] = class {
      get className() {
        return name;
      }
    };
  }
  return Api;
};

const setup = (client) => {
  const Api = fakeApi();
  const written = [];
  const env = {
    store: {},
    importer: async () => ({ Api }),
    connection: { withPeer: (_c, chat, use) => use({ peer: chat }) },
    queue: { run: (_key, _priority, task) => task() },
  };
  const shared = createSharedMedia(env, {
    userClient: async () => client,
    dialogOf: async (chat) => ({ id: chat }),
    tools: {
      toLinks: (dialog, messages) =>
        messages.map((m) => ({ id: `msg:telegram:${dialog.id}:${m.id}` })),
      writeChanged: async (_store, links) => written.push(...links),
    },
  });
  return { shared, written };
};

test("each kind's count, from Telegram's counters", async () => {
  const asked = [];
  const { shared } = setup({
    invoke: async (request) => {
      asked.push(request);
      return [
        { filter: { className: 'InputMessagesFilterPhotos' }, count: 12 },
        { filter: { className: 'InputMessagesFilterUrl' }, count: 3 },
        { filter: { className: 'InputMessagesFilterUnknown' }, count: 9 },
      ];
    },
  });
  const answer = await shared.sharedCounts({ chat: '42' });
  assert.equal(answer.ok, true);
  assert.equal(answer.counts.photos, 12);
  assert.equal(answer.counts.links, 3);
  assert.equal(answer.counts.videos, 0);
  assert.deepEqual(Object.keys(answer.counts), Object.keys(SHARED_KINDS));
  assert.equal(asked[0].filters.length, Object.keys(SHARED_KINDS).length);
  assert.deepEqual(
    SHARED_ORDER.map(([kind]) => kind),
    Object.keys(SHARED_KINDS),
    'the column lists every kind the server counts'
  );
});

test("a kind's messages, with its filter, stored, a page at a time", async () => {
  const asked = [];
  const page = Array.from({ length: SHARED_PAGE }, (_, i) => ({ id: 500 - i }));
  const { shared, written } = setup({
    getMessages: async (peer, options) => {
      asked.push({ peer, options });
      return Object.assign([...page], { total: 77 });
    },
  });
  const first = await shared.sharedMedia({ chat: '42', kind: 'files' });
  assert.equal(
    asked[0].options.filter.className,
    'InputMessagesFilterDocument'
  );
  assert.equal(asked[0].options.limit, SHARED_PAGE);
  assert.equal(asked[0].options.offsetId, undefined);
  assert.equal(first.count, 77);
  assert.equal(first.more, true);
  assert.equal(first.last, 500 - SHARED_PAGE + 1);
  assert.equal(first.messages[0].id, 'msg:telegram:42:500');
  assert.equal(written.length, SHARED_PAGE, 'stored');
  await shared.sharedMedia({ chat: '42', kind: 'files', offsetId: first.last });
  assert.equal(asked[1].options.offsetId, first.last);
  for (const kind of ['nope', 'toString']) {
    assert.equal((await shared.sharedMedia({ chat: '42', kind })).ok, false);
  }
});

test('the links in a text, each once', () => {
  assert.deepEqual(
    linksIn(
      'see https://a.example/x and http://b.example, https://a.example/x'
    ),
    ['https://a.example/x', 'http://b.example']
  );
  assert.deepEqual(linksIn('nothing here'), []);
  assert.deepEqual(linksIn(null), []);
});

const post = async (account, route, body) => {
  const path = `/api/telegram/${route}`;
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
    end(words) {
      this.body = words;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status, payload: JSON.parse(res.body) };
};

test('the routes take a chat and a kind, refuse the rest', async () => {
  const calls = [];
  const account = {
    sharedCounts: async (args) => {
      calls.push(['counts', args]);
      return { ok: true, counts: {} };
    },
    sharedMedia: async (args) => {
      calls.push(['media', args]);
      return { ok: true, messages: [] };
    },
  };
  assert.equal(
    (await post(account, 'shared-counts', { chat: '-1001' })).status,
    200
  );
  assert.equal(
    (
      await post(account, 'shared-media', {
        chat: '42',
        kind: 'photos',
        offsetId: 9,
      })
    ).status,
    200
  );
  assert.deepEqual(calls[1], [
    'media',
    { chat: '42', kind: 'photos', offsetId: 9 },
  ]);
  for (const [route, bad] of [
    ['shared-counts', {}],
    ['shared-counts', { chat: 'abc' }],
    ['shared-media', { chat: '42' }],
    ['shared-media', { chat: '42', kind: 'toString' }],
    ['shared-media', { chat: '42', kind: 'photos', offsetId: -1 }],
  ]) {
    assert.equal(
      (await post(account, route, bad)).status,
      400,
      JSON.stringify(bad)
    );
  }
  assert.equal(calls.length, 2);
});
