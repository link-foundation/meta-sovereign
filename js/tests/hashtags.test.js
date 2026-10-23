// Hashtag and cashtag search, live view counters and picture-in-picture
// (R-Y182): the routes' validation, the searches (messages.search,
// messages.searchGlobal, channels.searchPosts), messages.getMessagesViews
// and its answer, the batching of "seen" marks (once per post, a gap
// between requests), the counters kept, and the feature tests for
// picture-in-picture. Fake clients and clocks only; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { postRoute } from './helpers/post-route.js';
import {
  named,
  helpers,
  fakeClient,
  telegramError,
} from './helpers/telegram-fakes.mjs';
import {
  TAG,
  GLOBAL_PAGE,
  createGlobalSearch,
} from '../src/sources/telegram-global.js';
import {
  createChatSearch,
  SEARCH_PAGE,
} from '../src/sources/telegram-search.js';
import {
  MAX_VIEW_IDS,
  createViews,
  validViewsRequest,
  viewsOf,
} from '../src/sources/telegram-views.js';
import { validTagSearch } from '../src/server/routes-telegram-hashtags.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { parseTag, requestOf, scopesOf } from '../src/web/chat-tags.js';
import {
  MAX_BATCH,
  applyItems,
  countsViews,
  createViewBatcher,
  resetViews,
  statsOf,
} from '../src/web/chat-views.js';
import { inPip, pipModeOf, togglePip } from '../src/web/chat-pip.js';
import { threadOf } from '../src/web/chat-comments-bar.js';

test('hashtags and cashtags are read, with the channel after @', () => {
  assert.deepEqual(parseTag('#news'), { tag: '#news', username: null });
  assert.deepEqual(parseTag('$TON'), { tag: '$TON', username: null });
  assert.deepEqual(parseTag('#привет_мир'), {
    tag: '#привет_мир',
    username: null,
  });
  assert.deepEqual(parseTag('#tag@fake_channel'), {
    tag: '#tag',
    username: 'fake_channel',
  });
  assert.equal(parseTag('/start'), null);
  assert.equal(parseTag('#'), null);
  assert.equal(parseTag('word'), null);
  assert.equal(parseTag('#a b'), null);
  assert.equal(parseTag('#tag@ab'), null, 'a username is at least 4');
});

test('the scopes follow the chat named; the request holds only what it needs', () => {
  assert.deepEqual(scopesOf({ chat: '-1001' }), ['chat', 'all', 'public']);
  assert.deepEqual(scopesOf({}), ['all', 'public']);
  assert.deepEqual(requestOf({ tag: '#a', scope: 'chat', chat: '5' }), {
    tag: '#a',
    scope: 'chat',
    chat: '5',
  });
  assert.deepEqual(
    requestOf({ tag: '#a', scope: 'all', chat: '5', cursor: 'c1' }),
    { tag: '#a', scope: 'all', cursor: 'c1' }
  );
});

test('the search body is validated strictly', () => {
  assert.equal(validTagSearch({ tag: '#a', scope: 'all' }), true);
  assert.equal(validTagSearch({ tag: '$TON', scope: 'public' }), true);
  assert.equal(
    validTagSearch({ tag: '#a', scope: 'chat', chat: '-100' }),
    true
  );
  assert.equal(validTagSearch({ tag: '#a', scope: 'chat' }), false);
  assert.equal(validTagSearch({ tag: 'a', scope: 'all' }), false);
  assert.equal(validTagSearch({ tag: '#a b', scope: 'all' }), false);
  assert.equal(validTagSearch({ tag: '#a', scope: 'nowhere' }), false);
  assert.equal(validTagSearch({ tag: '#a', scope: 'all', cursor: 5 }), false);
  assert.equal(
    validTagSearch({ tag: '#a', scope: 'all', cursor: 'x'.repeat(100) }),
    false
  );
  assert.equal(TAG.test(`#${'a'.repeat(65)}`), false);
  assert.equal(validViewsRequest({ chat: '-100', ids: [1, 2] }), true);
  assert.equal(validViewsRequest({ chat: '-100', ids: [] }), false);
  assert.equal(validViewsRequest({ chat: '-100', ids: [1, 1] }), false);
  assert.equal(validViewsRequest({ chat: '-100', ids: [0] }), false);
  assert.equal(validViewsRequest({ chat: 'x', ids: [1] }), false);
  assert.equal(
    validViewsRequest({
      chat: '-100',
      ids: Array.from({ length: MAX_VIEW_IDS + 1 }, (_, i) => i + 1),
    }),
    false
  );
  assert.equal(
    validViewsRequest({ chat: '-100', ids: [1], increment: 'yes' }),
    false
  );
});

test('the routes refuse bad bodies before asking the account', async () => {
  const calls = [];
  const account = {
    searchChat: async (a) => (calls.push(['chat', a]), { ok: true }),
    searchTag: async (a) => (calls.push(['tag', a]), { ok: true }),
    messageViews: async (a) => (calls.push(['views', a]), { ok: true }),
  };
  assert.equal(
    await postRoute('search-tag', { tag: 'x', scope: 'all' }, account),
    400
  );
  assert.equal(
    await postRoute('search-tag', { tag: '#x', scope: 'chat' }, account),
    400
  );
  assert.equal(
    await postRoute('message-views', { chat: '-1', ids: [] }, account),
    400
  );
  assert.equal(calls.length, 0);
  assert.equal(
    await postRoute(
      'search-tag',
      { tag: '#x', scope: 'chat', chat: '-1', cursor: '40' },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('search-tag', { tag: '$T', scope: 'public' }, account),
    200
  );
  assert.equal(
    await postRoute(
      'message-views',
      { chat: '-1', ids: [3, 4], increment: true },
      account
    ),
    200
  );
  assert.deepEqual(calls, [
    ['chat', { chat: '-1', q: '#x', offsetId: 40, links: true }],
    ['tag', { tag: '$T', scope: 'public', cursor: null }],
    ['views', { chat: '-1', ids: [3, 4], increment: true }],
  ]);
  assert.equal(
    await postRoute('search-tag', { tag: '#x', scope: 'all' }, {}),
    400
  );
});

// --- the searches ---

const request = (name) =>
  class {
    constructor(args = {}) {
      Object.assign(this, args, { request: name });
    }
  };
const Api = {
  messages: { SearchGlobal: request('SearchGlobal') },
  channels: { SearchPosts: request('SearchPosts') },
  InputMessagesFilterEmpty: request('FilterEmpty'),
  InputPeerEmpty: request('PeerEmpty'),
};
const utils = {
  getPeerId: (x) => {
    if (x?.key === undefined) {
      throw new Error('no peer');
    }
    return x.key;
  },
};
const news = { className: 'Channel', key: '-1009', id: 9, title: 'Fake News' };
const post = (id, text) => ({
  id,
  peerId: { key: '-1009' },
  date: 1_790_000_000 + id,
  message: text,
  inputChat: { input: '-1009' },
});

const globalSetup = (answers) => {
  const store = createMemoryStore();
  const invoked = [];
  const client = {
    invoke: async (req) => {
      invoked.push(req);
      const next = answers(req, invoked.length);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    store,
    importer: async () => ({ Api, utils }),
    queue: { run: (key, priority, task) => task() },
    peers: { remember: async () => {} },
    live: { chats: new Map() },
  };
  const tools = {
    toLinks: telegramDialogLinks,
    dialogOfEntity: (chat, entity) => ({
      id: chat,
      entity,
      title: entity.title,
      isChannel: true,
    }),
    writeChanged: async (s, links) => {
      for (const link of links) {
        await s.put(link);
      }
      return links.length;
    },
  };
  return {
    store,
    invoked,
    search: createGlobalSearch(env, { userClient: async () => client, tools }),
  };
};

test('a hashtag is searched in every chat and in public posts', async () => {
  const page = Array.from({ length: GLOBAL_PAGE }, (_, i) =>
    post(500 - i, `news #tag ${i}`)
  );
  const { invoked, search, store } = globalSetup(() => ({
    messages: page,
    chats: [news],
    users: [],
    count: 90,
    nextRate: 5,
  }));
  const all = await search.searchTag({ tag: '#tag', scope: 'all' });
  assert.equal(invoked[0].request, 'SearchGlobal');
  assert.equal(invoked[0].q, '#tag');
  assert.equal(all.messages.length, GLOBAL_PAGE);
  assert.equal(all.more, true);
  assert.ok(await store.get('msg:telegram:-1009:500'));
  assert.equal(all.messages[0].raw, undefined);

  const posts = await search.searchTag({ tag: '#tag', scope: 'public' });
  assert.equal(invoked[1].request, 'SearchPosts');
  assert.equal(invoked[1].hashtag, 'tag', 'a hashtag without its #');
  assert.equal(invoked[1].query, undefined);
  const next = await search.searchTag({
    tag: '#tag',
    scope: 'public',
    cursor: posts.cursor,
  });
  assert.equal(invoked[2].offsetRate, 5);
  assert.equal(invoked[2].offsetId, 500 - GLOBAL_PAGE + 1);
  assert.equal(next.ok, true);

  await search.searchTag({ tag: '$TON', scope: 'public' });
  assert.equal(invoked[3].query, '$TON', 'a cashtag is a query');
  assert.equal(invoked[3].hashtag, undefined);
});

test('a bad tag is not asked; a flood or an unknown cursor is told', async () => {
  const { invoked, search } = globalSetup((_req, n) =>
    n === 1
      ? telegramError('FLOOD_WAIT_9')
      : { messages: [], chats: [], users: [] }
  );
  assert.deepEqual(await search.searchTag({ tag: 'plain', scope: 'all' }), {
    ok: false,
    supported: false,
  });
  assert.equal(invoked.length, 0);
  const flood = await search.searchTag({ tag: '#a', scope: 'public' });
  assert.equal(flood.ok, false);
  assert.equal(flood.code, 'flood');
  const gone = await search.searchTag({
    tag: '#a',
    scope: 'all',
    cursor: 'zz',
  });
  assert.deepEqual(gone, {
    ok: true,
    messages: [],
    count: 0,
    more: false,
    cursor: null,
  });
});

test('a hashtag in one chat answers the messages and where to go on', async () => {
  const store = createMemoryStore();
  const asked = [];
  const messages = Array.from({ length: SEARCH_PAGE }, (_, i) => ({
    id: 300 - i,
    message: `#tag ${i}`,
    date: 1_760_000_000 + i,
    senderId: 42,
    peerId: { userId: 42 },
  }));
  const client = {
    getMessages: async (peer, options) => {
      asked.push(options);
      return Object.assign([...messages], { total: 80 });
    },
  };
  const env = {
    store,
    queue: { run: (key, priority, task) => task() },
    connection: { withPeer: (_c, chat, use) => use(`peer:${chat}`) },
  };
  const { searchChat } = createChatSearch(env, {
    userClient: async () => client,
    dialogOf: async (chat) => ({ id: chat, isUser: true }),
    tools: {
      toLinks: telegramDialogLinks,
      writeChanged: async (s, links) => {
        for (const link of links) {
          await s.put(link);
        }
      },
    },
  });
  const plain = await searchChat({ chat: '42', q: '#tag' });
  assert.equal(plain.messages, undefined, 'ids only, as before');
  const answer = await searchChat({ chat: '42', q: '#tag', links: true });
  assert.equal(asked[1].search, '#tag');
  assert.equal(answer.messages.length, SEARCH_PAGE);
  assert.equal(answer.messages[0].id, 'msg:telegram:42:300');
  assert.equal(answer.messages[0].raw, undefined);
  assert.equal(answer.cursor, String(300 - SEARCH_PAGE + 1));
});

// --- views ---

const MessageViews = named('messages.MessageViews');

test('the counters of posts are asked, in the order of the ids', async () => {
  const log = [];
  const client = fakeClient(
    () => ({
      views: [
        { views: 120, forwards: 3, replies: { replies: 7 } },
        { views: 5 },
      ],
    }),
    log
  );
  const env = {
    importer: async () => ({
      Api: { messages: { GetMessagesViews: MessageViews } },
      helpers,
    }),
    queue: { run: (key, priority, task) => task() },
    connection: { withPeer: (_c, chat, use) => use(`peer:${chat}`) },
  };
  const { messageViews } = createViews(env, { userClient: async () => client });
  const peek = await messageViews({ chat: '-1009', ids: [10, 11] });
  assert.deepEqual(peek, {
    ok: true,
    items: [
      { id: 10, views: 120, forwards: 3, replies: 7 },
      { id: 11, views: 5 },
    ],
  });
  assert.equal(log[0].increment, false);
  assert.deepEqual(log[0].id, [10, 11]);
  await messageViews({ chat: '-1009', ids: [10], increment: true });
  assert.equal(log[1].increment, true);
  assert.equal((await messageViews({ chat: '-1009', ids: [] })).ok, false);
  assert.equal(log.length, 2, 'a bad request is not asked');
  assert.deepEqual(viewsOf(1, { views: -3, forwards: 'x' }), { id: 1 });
});

test('a counter wins over what the stored message carries', () => {
  const message = {
    id: 'msg:telegram:-1009:10',
    raw: { views: 100, forwards: 2, replies: { replies: 4, comments: true } },
  };
  assert.deepEqual(statsOf(message), { views: 100, forwards: 2, replies: 4 });
  assert.deepEqual(statsOf(message, { views: 150, replies: 9 }), {
    views: 150,
    forwards: 2,
    replies: 9,
  });
  assert.deepEqual(statsOf({ raw: {} }), {
    views: null,
    forwards: null,
    replies: null,
  });
  assert.equal(countsViews(message), true);
  assert.equal(countsViews({ id: 'msg:telegram:5:1', raw: {} }), false);
  assert.equal(countsViews({ id: 'msg:email:5:1', raw: { views: 3 } }), false);
  assert.equal(threadOf(message, 9).count, 9);
  assert.equal(threadOf(message).count, 4);
  resetViews();
  applyItems('-1009', [{ id: 10, views: 1 }]);
});

// --- batching ---

const clock = () => {
  const state = { at: 1_000_000, timers: [] };
  return {
    state,
    now: () => state.at,
    setTimer: (fn, ms) => {
      const timer = { fn, at: state.at + ms };
      state.timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      state.timers = state.timers.filter((t) => t !== timer);
    },
    // Moves time on and runs what falls due.
    advance: async (ms) => {
      state.at += ms;
      for (const timer of state.timers.filter((t) => t.at <= state.at)) {
        state.timers = state.timers.filter((t) => t !== timer);
        timer.fn();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
};

const batcherSetup = (options = {}) => {
  const c = clock();
  const sent = [];
  const got = [];
  const batcher = createViewBatcher({
    send: async (body) => {
      sent.push(body);
      return { ok: true, items: body.ids.map((id) => ({ id, views: id })) };
    },
    onItems: (chat, items) => got.push([chat, items.length]),
    gap: 4000,
    refresh: 30_000,
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    ...options,
  });
  return { c, sent, got, batcher };
};

test('posts seen are marked viewed together, once, with a gap between requests', async () => {
  const { c, sent, got, batcher } = batcherSetup();
  batcher.see('-1', 1);
  batcher.see('-1', 2);
  batcher.see('-2', 7);
  assert.equal(sent.length, 0, 'batched: nothing at once');
  await c.advance(0);
  assert.deepEqual(sent, [
    { chat: '-1', ids: [1, 2], increment: true },
    { chat: '-2', ids: [7], increment: true },
  ]);
  assert.deepEqual(got, [
    ['-1', 2],
    ['-2', 1],
  ]);
  // Scrolled away and back: not counted twice.
  batcher.unsee('-1', 1);
  batcher.see('-1', 1);
  await c.advance(1000);
  assert.equal(sent.filter((s) => s.increment).length, 2);
  // A new post waits for the gap since the last request.
  batcher.see('-1', 3);
  await c.advance(2999);
  assert.equal(sent.filter((s) => s.ids.includes(3)).length, 0);
  assert.equal(batcher.counts('-1', 3), true);
  await c.advance(1);
  assert.deepEqual(sent.at(-1), { chat: '-1', ids: [3], increment: true });
  batcher.stop();
});

test('a post seen before the gap is over is marked in the next batch', async () => {
  const { c, sent, batcher } = batcherSetup();
  batcher.see('-1', 1);
  await c.advance(0);
  batcher.see('-1', 2);
  batcher.unsee('-1', 2); // scrolled past quickly: it was still seen
  batcher.see('-1', 3);
  await c.advance(3999);
  assert.equal(sent.length, 1);
  await c.advance(1);
  assert.deepEqual(sent[1], { chat: '-1', ids: [2, 3], increment: true });
  batcher.stop();
});

test('posts still on screen are asked again, without increment', async () => {
  const { c, sent, batcher } = batcherSetup();
  batcher.see('-1', 1);
  batcher.see('-1', 2);
  await c.advance(0);
  await c.advance(30_000);
  const peek = sent.filter((s) => !s.increment);
  assert.ok(peek.length >= 1);
  assert.deepEqual(peek[0], { chat: '-1', ids: [1, 2], increment: false });
  batcher.unsee('-1', 2);
  await c.advance(30_000);
  assert.deepEqual(sent.at(-1), { chat: '-1', ids: [1], increment: false });
  // Nothing on screen: nothing is asked.
  batcher.unsee('-1', 1);
  const before = sent.length;
  await c.advance(120_000);
  assert.equal(sent.length, before);
  batcher.stop();
});

test('a batch holds at most a hundred posts; a failed request is no crash', async () => {
  const { c, sent, batcher } = batcherSetup({
    send: async (body) => {
      throw new Error(`down ${body.ids.length}`);
    },
  });
  for (let id = 1; id <= MAX_BATCH + 20; id += 1) {
    batcher.see('-1', id);
  }
  await c.advance(0);
  assert.equal(sent.length, 0);
  batcher.stop();
  const both = batcherSetup();
  for (let id = 1; id <= MAX_BATCH + 20; id += 1) {
    both.batcher.see('-1', id);
  }
  await both.c.advance(0);
  assert.deepEqual(
    both.sent.map((s) => s.ids.length),
    [MAX_BATCH, 20]
  );
  both.batcher.stop();
});

// --- picture-in-picture ---

test('picture-in-picture is offered where the browser has it', () => {
  const standard = { requestPictureInPicture: async () => {} };
  assert.equal(
    pipModeOf(standard, { pictureInPictureEnabled: true }),
    'standard'
  );
  assert.equal(pipModeOf(standard, { pictureInPictureEnabled: false }), null);
  assert.equal(
    pipModeOf(
      { ...standard, disablePictureInPicture: true },
      { pictureInPictureEnabled: true }
    ),
    null
  );
  const webkit = {
    webkitSetPresentationMode() {},
    webkitSupportsPresentationMode: (mode) => mode === 'picture-in-picture',
  };
  assert.equal(pipModeOf(webkit, {}), 'webkit');
  assert.equal(
    pipModeOf({ ...webkit, webkitSupportsPresentationMode: () => false }, {}),
    null
  );
  assert.equal(pipModeOf(null, {}), null);
  assert.equal(pipModeOf({}, {}), null);
});

test('the button enters and leaves picture-in-picture, either way', async () => {
  const calls = [];
  const doc = {
    pictureInPictureEnabled: true,
    pictureInPictureElement: null,
    exitPictureInPicture: async () => {
      calls.push('exit');
      doc.pictureInPictureElement = null;
    },
  };
  const video = {
    requestPictureInPicture: async () => {
      calls.push('enter');
      doc.pictureInPictureElement = video;
    },
  };
  assert.equal(inPip(video, doc), false);
  assert.equal(await togglePip(video, doc), true);
  assert.equal(inPip(video, doc), true);
  await togglePip(video, doc);
  assert.deepEqual(calls, ['enter', 'exit']);
  const webkit = {
    webkitPresentationMode: 'inline',
    webkitSupportsPresentationMode: () => true,
    webkitSetPresentationMode(mode) {
      calls.push(mode);
      this.webkitPresentationMode = mode;
    },
  };
  await togglePip(webkit, {});
  assert.equal(inPip(webkit, {}), true);
  await togglePip(webkit, {});
  assert.deepEqual(calls.slice(2), ['picture-in-picture', 'inline']);
  // A refusal is no crash.
  const refusing = {
    requestPictureInPicture: async () => {
      throw new Error('no');
    },
  };
  assert.equal(
    await togglePip(refusing, { pictureInPictureEnabled: true }),
    false
  );
});
