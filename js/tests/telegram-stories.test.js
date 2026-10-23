// Viewing stories (R-Y140): the strip read page by page, one peer's
// stories (skipped ones read again), seen up to an id, a story's media
// downloaded once and cached, Telegram's errors as codes, the routes'
// validation (POST bodies, the GET's query) and the pure helpers the page
// uses. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { createStories } from '../src/sources/telegram-stories.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import {
  PHOTO_MS,
  agoParts,
  hasUnread,
  markSeen,
  mergePeers,
  nextPosition,
  orderStrip,
  previousPosition,
  showMs,
  startIndex,
  unreadPeers,
} from '../src/web/stories-model.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputPhotoFileLocation: named('InputPhotoFileLocation'),
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
  stories: {
    GetAllStories: named('GetAllStories'),
    GetPeerStories: named('GetPeerStories'),
    GetStoriesByID: named('GetStoriesByID'),
    ReadStories: named('ReadStories'),
  },
};

const photo = {
  className: 'MessageMediaPhoto',
  photo: {
    id: 5n,
    accessHash: 6n,
    fileReference: new Uint8Array([1]),
    dcId: 2,
    sizes: [
      { className: 'PhotoSize', type: 'm', size: 100 },
      { className: 'PhotoSize', type: 'x', size: 900 },
    ],
  },
};
const video = {
  className: 'MessageMediaDocument',
  document: {
    id: 8n,
    accessHash: 9n,
    fileReference: new Uint8Array([2]),
    dcId: 2,
    size: 1234,
    mimeType: 'video/mp4',
    attributes: [
      { className: 'DocumentAttributeVideo', duration: 7.5, w: 720, h: 1280 },
    ],
  },
};
const item = (id, extra = {}) => ({
  className: 'StoryItem',
  id,
  date: 1000 + id,
  expireDate: 2000,
  caption: `caption ${id}`,
  entities: [
    { className: 'MessageEntityBold', offset: 0, length: 7 },
    {
      className: 'MessageEntityTextUrl',
      offset: 8,
      length: 1,
      url: 'https://a.b',
    },
  ],
  media: photo,
  ...extra,
});

const ann = { id: 42n, firstName: 'Ann', lastName: 'Lee' };
const me = { id: 7n, firstName: 'Me', self: true };
const news = { id: 99n, title: 'News' };

const make = (answer, { mediaDir } = {}) => {
  const log = [];
  const client = {
    ...fakeClient(answer, log),
    downloads: [],
    downloadFile: async (location) => {
      client.downloads.push(location);
      return Buffer.from('bytes');
    },
  };
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ peer: chat }) },
  };
  const actions = createStories(env, {
    userClient: async () => client,
    mediaDir,
  });
  return { actions, log, client };
};

const allAnswer = (extra = {}) => ({
  className: 'stories.AllStories',
  hasMore: true,
  state: 'S1',
  users: [ann, me],
  chats: [news],
  peerStories: [
    { peer: { userId: 7n }, maxReadId: 0, stories: [item(3)] },
    {
      peer: { userId: 42n },
      maxReadId: 1,
      stories: [item(1), item(2), { className: 'StoryItemDeleted', id: 3 }],
    },
    {
      peer: { channelId: 99n },
      maxReadId: 5,
      stories: [item(5)],
    },
  ],
  ...extra,
});

test('stories shapes the strip: names, newest id, unread, not the own', async () => {
  const { actions, log } = make(() => allAnswer());
  const got = await actions.stories();
  assert.equal(log[0].className, 'GetAllStories');
  assert.equal(log[0].hidden, false);
  assert.equal(log[0].next, undefined);
  assert.equal(got.ok, true);
  assert.equal(got.state, 'S1');
  assert.equal(got.more, true);
  assert.deepEqual(
    got.peers.map((p) => [p.peer, p.name, p.self, p.lastId, p.unread]),
    [
      ['7', 'Me', true, 3, false],
      ['42', 'Ann Lee', false, 2, true],
      ['-10099', 'News', false, 5, false],
    ]
  );
});

test('the next page is asked with next and the state', async () => {
  const { actions, log } = make(() => allAnswer({ hasMore: false }));
  const got = await actions.stories({ state: 'S1' });
  assert.equal(log[0].next, true);
  assert.equal(log[0].state, 'S1');
  assert.equal(got.more, false);
  assert.equal((await actions.stories({ state: 'bad state!' })).ok, false);
  assert.equal(log.length, 1);
});

test('"not modified" is told so', async () => {
  const { actions } = make(() => ({
    className: 'stories.AllStoriesNotModified',
    state: 'S9',
  }));
  assert.deepEqual(await actions.stories({ state: 'S9' }), {
    ok: true,
    notModified: true,
    peers: [],
    state: 'S9',
  });
});

test('storiesPeer shows a peer’s stories, skipped ones read again by id', async () => {
  const { actions, log } = make((request) =>
    request.className === 'GetPeerStories'
      ? {
          stories: {
            peer: { userId: 42n },
            maxReadId: 1,
            stories: [
              { className: 'StoryItemSkipped', id: 2, date: 1, expireDate: 2 },
              item(1, { media: video }),
              { className: 'StoryItemDeleted', id: 3 },
            ],
          },
          users: [ann],
          chats: [],
        }
      : { stories: [item(2)] }
  );
  const got = await actions.storiesPeer({ chat: '42' });
  assert.deepEqual(
    log.map((r) => r.className),
    ['GetPeerStories', 'GetStoriesByID']
  );
  assert.deepEqual(log[1].id, [2]);
  assert.equal(got.ok, true);
  assert.equal(got.peer.name, 'Ann Lee');
  assert.deepEqual(
    got.stories.map((s) => [s.id, s.media.kind]),
    [
      [1, 'video'],
      [2, 'photo'],
    ]
  );
  assert.deepEqual(got.stories[0].media, {
    kind: 'video',
    duration: 7.5,
    w: 720,
    h: 1280,
  });
  assert.equal(got.stories[1].caption, 'caption 2');
  assert.deepEqual(got.stories[1].entities[1], {
    className: 'MessageEntityTextUrl',
    offset: 8,
    length: 1,
    url: 'https://a.b',
  });
});

test('storiesRead tells Telegram, refuses bad input, maps errors', async () => {
  const { actions, log } = make(() => [1]);
  assert.deepEqual(await actions.storiesRead({ chat: '42', maxId: 4 }), {
    ok: true,
  });
  assert.equal(log[0].className, 'ReadStories');
  assert.equal(log[0].maxId, 4);
  assert.equal((await actions.storiesRead({ chat: 'x', maxId: 4 })).ok, false);
  assert.equal((await actions.storiesRead({ chat: '1', maxId: 0 })).ok, false);
  assert.equal(log.length, 1);
  const failing = make(() => telegramError('STORY_ID_INVALID'));
  assert.equal(
    (await failing.actions.storiesPeer({ chat: '42' })).code,
    'gone'
  );
});

test('storyMedia downloads once: the largest photo, then the video', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-stories-'));
  try {
    const stories = { 1: item(1), 2: item(2, { media: video }) };
    const { actions, client, log } = make(
      (request) => ({ stories: request.id.map((id) => stories[id]) }),
      { mediaDir: dir }
    );
    const got = await actions.storyMedia({ chat: '42', id: 1 });
    assert.equal(got.mimeType, 'image/jpeg');
    assert.equal(got.buffer.toString(), 'bytes');
    assert.equal(client.downloads[0].className, 'InputPhotoFileLocation');
    assert.equal(client.downloads[0].thumbSize, 'x');
    const again = await actions.storyMedia({ chat: '42', id: 1 });
    assert.equal(again.buffer.toString(), 'bytes');
    assert.equal(client.downloads.length, 1);
    assert.equal(log.length, 1);
    const clip = await actions.storyMedia({ chat: '-10099', id: 2 });
    assert.equal(clip.mimeType, 'video/mp4');
    assert.equal(client.downloads[1].className, 'InputDocumentFileLocation');
    // Not a story, or not valid: nothing is asked.
    assert.equal(await actions.storyMedia({ chat: '42', id: 9 }), null);
    assert.equal(await actions.storyMedia({ chat: '../x', id: 1 }), null);
    assert.equal(await actions.storyMedia({ chat: '42', id: -1 }), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the POST routes validate their bodies', async () => {
  const calls = [];
  const account = {
    stories: async (r) => calls.push(['stories', r]) && { ok: true },
    storiesPeer: async (r) => calls.push(['peer', r]) && { ok: true },
    storiesRead: async (r) => calls.push(['read', r]) && { ok: true },
  };
  assert.equal((await post('stories', {}, account)).status, 200);
  assert.equal((await post('stories', { state: 'S1' }, account)).status, 200);
  assert.equal((await post('stories', { state: 5 }, account)).status, 400);
  assert.equal((await post('stories', { state: '../' }, account)).status, 400);
  assert.equal(
    (await post('stories-peer', { chat: '-10099' }, account)).status,
    200
  );
  assert.equal(
    (await post('stories-peer', { chat: 'a' }, account)).status,
    400
  );
  assert.equal(
    (await post('stories-read', { chat: '42', maxId: 3 }, account)).status,
    200
  );
  for (const body of [
    { chat: '42', maxId: '3' },
    { chat: '42', maxId: 0 },
    { chat: '42', maxId: 1.5 },
    { maxId: 3 },
  ]) {
    assert.equal((await post('stories-read', body, account)).status, 400);
  }
  assert.deepEqual(calls, [
    ['stories', {}],
    ['stories', { state: 'S1' }],
    ['peer', { chat: '-10099' }],
    ['read', { chat: '42', maxId: 3 }],
  ]);
});

const get = async (url, account, headers = {}) => {
  const req = Readable.from([]);
  Object.assign(req, { method: 'GET', url, headers });
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, head = {}) {
      this.status = status;
      Object.assign(this.headers, head);
    },
    end(body) {
      this.body = body;
    },
  };
  await handleTelegramRoutes(req, res, '/api/telegram/story', {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

test('GET story validates the query, ranges the bytes, refuses other sites', async () => {
  const asked = [];
  const account = {
    storyMedia: async (r) => {
      asked.push(r);
      return r.id === 1
        ? { buffer: Buffer.from('0123456789'), mimeType: 'video/mp4' }
        : null;
    },
  };
  const ok = await get('/api/telegram/story?peer=-10099&id=1', account);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'video/mp4');
  assert.equal(ok.headers['accept-ranges'], 'bytes');
  const part = await get('/api/telegram/story?peer=42&id=1', account, {
    range: 'bytes=2-4',
  });
  assert.equal(part.status, 206);
  assert.equal(part.body.toString(), '234');
  const gone = await get('/api/telegram/story?peer=42&id=2', account);
  assert.equal(gone.status, 404);
  for (const query of [
    'peer=a&id=1',
    'peer=42&id=0',
    'peer=42&id=-1',
    'peer=42&id=1e3',
    'peer=42',
    'id=1',
    'peer=../1&id=1',
  ]) {
    const refused = await get(`/api/telegram/story?${query}`, account);
    assert.equal(refused.status, 400, query);
  }
  const foreign = await get('/api/telegram/story?peer=42&id=1', account, {
    'sec-fetch-site': 'cross-site',
  });
  assert.equal(foreign.status, 403);
  assert.equal(asked.length, 3);
  const none = await get('/api/telegram/story?peer=42&id=1', {});
  assert.equal(none.status, 501);
});

test('the strip: unread, order, merging, marking seen', () => {
  const p = (peer, lastId, maxReadId, self = false) => ({
    peer,
    lastId,
    maxReadId,
    self,
    unread: !self && maxReadId < lastId,
  });
  assert.equal(hasUnread(p('1', 4, 3)), true);
  assert.equal(hasUnread(p('1', 4, 4)), false);
  assert.equal(hasUnread(p('7', 9, 0, true)), false);
  assert.equal(hasUnread(null), false);
  const peers = [p('a', 2, 2), p('b', 5, 1), p('me', 1, 0, true), p('c', 3, 0)];
  assert.deepEqual(
    orderStrip(peers).map((x) => x.peer),
    ['me', 'b', 'c', 'a']
  );
  assert.deepEqual([...unreadPeers(peers)], ['b', 'c']);
  const merged = mergePeers(peers, [p('b', 6, 1), p('d', 1, 0)]);
  assert.deepEqual(
    merged.map((x) => [x.peer, x.lastId]),
    [
      ['me', 1],
      ['b', 6],
      ['c', 3],
      ['d', 1],
      ['a', 2],
    ]
  );
  const seen = markSeen(peers, 'b', 5);
  assert.equal(seen.find((x) => x.peer === 'b').unread, false);
  assert.equal(markSeen(seen, 'b', 2).find((x) => x.peer === 'b').maxReadId, 5);
});

test('the viewer’s start, steps and times', () => {
  const stories = [{ id: 2 }, { id: 4 }, { id: 9 }];
  assert.equal(startIndex(stories, 0), 0);
  assert.equal(startIndex(stories, 4), 2);
  assert.equal(startIndex(stories, 9), 0);
  const at = (peerIndex, storyIndex) => ({ peerIndex, storyIndex });
  assert.deepEqual(nextPosition(at(0, 0), 3, 2), at(0, 1));
  assert.deepEqual(nextPosition(at(0, 2), 3, 2), at(1, null));
  assert.equal(nextPosition(at(1, 2), 3, 2), null);
  assert.equal(nextPosition(at(0, 0), 0, 1), null);
  assert.deepEqual(previousPosition(at(1, 2)), at(1, 1));
  assert.deepEqual(previousPosition(at(1, 0)), at(0, 'last'));
  assert.deepEqual(previousPosition(at(0, 0)), at(0, 0));
  assert.equal(showMs({ media: { kind: 'photo' } }), PHOTO_MS);
  assert.equal(showMs({ media: { kind: 'photo' } }, 600), 600);
  assert.equal(showMs({ media: { kind: 'video', duration: 7.5 } }), 7500);
  assert.equal(showMs({ media: { kind: 'video', duration: null } }), null);
  assert.deepEqual(agoParts(1000, 990), { unit: 'now', count: 0 });
  assert.deepEqual(agoParts(10_000, 10_000 - 5 * 60), {
    unit: 'minutes',
    count: 5,
  });
  assert.deepEqual(agoParts(100_000, 100_000 - 2 * 3600 - 30), {
    unit: 'hours',
    count: 2,
  });
  assert.deepEqual(agoParts(1_000_000, 1_000_000 - 3 * 86_400), {
    unit: 'days',
    count: 3,
  });
});
