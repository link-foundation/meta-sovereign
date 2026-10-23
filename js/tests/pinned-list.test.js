// The pinned messages list, similar channels and fact checks (R-Y166): the
// requests built, Telegram's answers as the page's shapes, caching, errors
// as codes, the routes' strict validation and the page's pure helpers.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PINNED_PAGE,
  createPinnedList,
} from '../src/sources/telegram-pinned-list.js';
import {
  createSimilarChannels,
  similarOf,
} from '../src/sources/telegram-similar-channels.js';
import {
  createFactChecks,
  factOf,
} from '../src/sources/telegram-fact-checks.js';
import { postRoute } from './helpers/post-route.js';
import {
  hiddenKey,
  mayUnpin,
  mergePinned,
  readHidden,
  writeHidden,
} from '../src/web/chat-pinned.js';
import { hasSimilar, similarTarget } from '../src/web/chat-similar.js';
import {
  askFactCheck,
  factOfRaw,
  forgetFactChecks,
} from '../src/web/chat-fact-check.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };
const Api = {
  messages: {
    Search: named('Search'),
    UnpinAllMessages: named('UnpinAllMessages'),
    GetFactCheck: named('GetFactCheck'),
  },
  channels: {
    GetChannelRecommendations: named('GetChannelRecommendations'),
    JoinChannel: named('JoinChannel'),
  },
  InputMessagesFilterPinned: named('InputMessagesFilterPinned'),
};

const make = (answer) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request, log.length);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    importer: async () => ({
      Api,
      helpers: { returnBigInt: (v) => BigInt(v) },
    }),
    connection: { withPeer: async (_c, chat, use) => use({ peerOf: chat }) },
  };
  const context = {
    userClient: async () => client,
    dialogOf: async (chat) => ({ id: chat }),
    tools: {
      toLinks: (dialog, messages) =>
        messages.map((m) => ({ id: `msg:telegram:${dialog.id}:${m.id}` })),
    },
  };
  return { env, context, log };
};

const message = (id) => ({ className: 'Message', id });

test('pinnedList asks the pinned filter, newest first, with the count', async () => {
  const { env, context, log } = make(() => ({
    messages: [message(3), message(9), { className: 'MessageEmpty', id: 1 }],
    count: 7,
  }));
  const { pinnedList } = createPinnedList(env, context);
  const answer = await pinnedList({ chat: '-1005', topMsgId: 4 });
  assert.deepEqual(
    answer.messages.map((m) => m.id),
    ['msg:telegram:-1005:9', 'msg:telegram:-1005:3']
  );
  assert.equal(answer.count, 7);
  assert.equal(answer.next, null);
  assert.equal(log[0].filter.className, 'InputMessagesFilterPinned');
  assert.equal(log[0].topMsgId, 4);
  assert.equal(log[0].limit, PINNED_PAGE);
});

test('a full page offers the next, by the last id', async () => {
  const many = Array.from({ length: PINNED_PAGE }, (_, i) => message(100 + i));
  const { env, context, log } = make(() => ({ messages: many }));
  const { pinnedList } = createPinnedList(env, context);
  const answer = await pinnedList({ chat: '42', offsetId: '120' });
  assert.equal(answer.next, 100);
  assert.equal(log[0].offsetId, 120);
  assert.equal('topMsgId' in log[0], false);
});

test('unpinAll asks again while Telegram says there is more', async () => {
  const { env, context, log } = make((_r, n) => ({ offset: n < 3 ? 5 : 0 }));
  const { unpinAll } = createPinnedList(env, context);
  assert.deepEqual(await unpinAll({ chat: '-1005', topMsgId: 2 }), {
    ok: true,
  });
  assert.equal(log.length, 3);
  assert.equal(log[0].className, 'UnpinAllMessages');
  assert.equal(log[0].topMsgId, 2);
});

test('pinned errors become codes and bad bodies are refused', async () => {
  const { env, context, log } = make(() =>
    Object.assign(new Error('x'), { errorMessage: 'CHAT_ADMIN_REQUIRED' })
  );
  const { pinnedList, unpinAll } = createPinnedList(env, context);
  for (const body of [{}, { chat: 'me' }, { chat: '5', topMsgId: 'x' }]) {
    assert.equal((await pinnedList(body)).ok, false);
    assert.equal((await unpinAll(body)).ok, false);
  }
  assert.equal(log.length, 0);
  assert.equal((await unpinAll({ chat: '-5' })).code, 'no-right');
});

test('similar channels: only channels listed, kept, joined on request', async () => {
  const { env, context, log } = make((request) =>
    request.className === 'JoinChannel'
      ? {}
      : {
          chats: [
            {
              className: 'Channel',
              id: 77n,
              title: 'News',
              username: 'news',
              participantsCount: 900,
              broadcast: true,
            },
            { className: 'Chat', id: 5n, title: 'Group' },
          ],
        }
  );
  const { similarChannels, similarJoin } = createSimilarChannels(
    { ...env, now: () => 1000 },
    context
  );
  const answer = await similarChannels({ chat: '-1005' });
  assert.deepEqual(answer.channels, [
    {
      chat: '-10077',
      title: 'News',
      username: 'news',
      members: 900,
      broadcast: true,
    },
  ]);
  await similarChannels({ chat: '-1005' });
  assert.equal(log.length, 1, 'the second ask is kept');
  assert.equal((await similarChannels({ chat: '5' })).ok, false);
  assert.deepEqual(await similarJoin({ chat: '-10077' }), {
    ok: true,
    chat: '-10077',
  });
  assert.equal(log.at(-1).className, 'JoinChannel');
  assert.equal(similarOf({ className: 'Chat', id: 1n }), null);
});

test('fact checks: asked once by id, texts with entities, kept', async () => {
  const { env, context, log } = make(() => [
    {
      country: 'DE',
      text: {
        text: 'Not true',
        entities: [{ className: 'MessageEntityBold', offset: 0, length: 3 }],
      },
    },
    { needCheck: true },
  ]);
  const { factChecks } = createFactChecks(env, context);
  const first = await factChecks({ chat: '-1005', ids: [4, 5] });
  assert.deepEqual(first.items, [
    {
      id: 4,
      country: 'DE',
      text: 'Not true',
      entities: [{ className: 'MessageEntityBold', offset: 0, length: 3 }],
    },
  ]);
  assert.deepEqual(log[0].msgId, [4, 5]);
  await factChecks({ chat: '-1005', ids: [4, 5] });
  assert.equal(log.length, 1, 'answers are kept, empty ones too');
  assert.equal(factOf(1, { text: { text: '' } }), null);
  for (const ids of [[], [0], ['1'], Array(101).fill(1)]) {
    assert.equal((await factChecks({ chat: '5', ids })).ok, false);
  }
});

test('the routes validate strictly', async () => {
  const account = {
    pinnedList: async () => ({ ok: true }),
    unpinAll: async () => ({ ok: true }),
    similarChannels: async () => ({ ok: true }),
    similarJoin: async () => ({ ok: true }),
    factChecks: async () => ({ ok: true }),
  };
  const cases = [
    ['pinned-list', {}, 400],
    ['pinned-list', { chat: '5', offsetId: 'a' }, 400],
    ['pinned-list', { chat: '-5', topMsgId: 3, offsetId: 9 }, 200],
    ['unpin-all', { chat: '-5', offsetId: 1 }, 400],
    ['unpin-all', { chat: '-5', topMsgId: '3' }, 200],
    ['similar-channels', { chat: '-5' }, 400],
    ['similar-channels', { chat: '-1005' }, 200],
    ['similar-join', { chat: 'x' }, 400],
    ['similar-join', { chat: '-1005' }, 200],
    ['fact-checks', { chat: '5', ids: [] }, 400],
    ['fact-checks', { chat: '5', ids: [1.5] }, 400],
    ['fact-checks', { chat: '5', ids: [1, 2] }, 200],
  ];
  for (const [route, body, status] of cases) {
    assert.equal(
      await postRoute(route, body, account),
      status,
      `${route} ${JSON.stringify(body)}`
    );
  }
});

test('page: hiding is kept per chat and topic, mayUnpin, merging', () => {
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
  const key = hiddenKey('telegram:-1005', 4);
  assert.notEqual(key, hiddenKey('telegram:-1005'));
  assert.equal(readHidden(key, storage), null);
  writeHidden(key, 'msg:telegram:-1005:9', storage);
  assert.equal(readHidden(key, storage), 'msg:telegram:-1005:9');
  assert.equal(
    readHidden(key, {
      getItem() {
        throw new Error('blocked');
      },
    }),
    null
  );
  assert.equal(mayUnpin({ personal: true }, null), true);
  assert.equal(mayUnpin({}, { canPin: true }), true);
  assert.equal(mayUnpin({}, { canPin: false }), false);
  assert.equal(mayUnpin({}, null), false);
  assert.deepEqual(mergePinned([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]), [
    { id: 'a' },
    { id: 'b' },
  ]);
});

test('page: similar row only for a channel, target, fact check helpers', async () => {
  const api = { telegramSimilarChannels: () => {} };
  const chat = { source: 'telegram', chat: '-1005' };
  assert.equal(hasSimilar(chat, { broadcast: true }, api), true);
  assert.equal(hasSimilar(chat, { broadcast: false }, api), false);
  assert.equal(
    hasSimilar({ ...chat, chat: '-5' }, { broadcast: true }, api),
    false
  );
  assert.equal(hasSimilar(chat, { broadcast: true }, {}), false);
  assert.deepEqual(similarTarget({ chat: '-1', title: 'T' }), {
    source: 'telegram',
    chat: '-1',
    name: 'T',
    kind: 'channel',
  });
  assert.equal(factOfRaw({ needCheck: true }, null), null);
  assert.deepEqual(factOfRaw({ country: 'US', text: { text: 'x' } }), {
    country: 'US',
    text: 'x',
    entities: [],
  });
  // Asks of one moment make one request; an answered id is not asked again.
  forgetFactChecks();
  const asked = [];
  const fact = {
    telegramFactChecks: async (body) => {
      asked.push(body);
      return { ok: true, items: [] };
    },
  };
  askFactCheck(fact, '5', 1);
  askFactCheck(fact, '5', 2);
  askFactCheck(fact, '5', 1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(asked, [{ chat: '5', ids: [1, 2] }]);
  askFactCheck(fact, '5', 2);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(asked.length, 1);
  forgetFactChecks();
});
