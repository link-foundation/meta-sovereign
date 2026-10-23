// Three gaps closed (R-Y161): effects on file sends, the join requests
// bar following Telegram live, and topic links switching to the topic.
// Fake clients and plain objects; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createFileSender } from '../src/sources/telegram-upload.js';
import { withEffect } from '../src/sources/telegram-send.js';
import { updateEffect } from '../src/sources/telegram-updates.js';
import {
  createTelegramLive,
  requestsLinkId,
} from '../src/sources/telegram-account-live.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { isStreamedId } from '../src/server/routes-events.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  requestsLinkOf,
  requestsShown,
} from '../src/web/chat-join-requests.js';
import { arrivalStep } from '../src/web/chat-jump.js';
import { parseMessageLink } from '../src/web/message-links.js';
import { postRoute } from './helpers/post-route.js';

class SendMedia {
  constructor(fields) {
    Object.assign(this, fields);
    this.className = 'messages.SendMedia';
  }
}
class SendMultiMedia {
  constructor(fields) {
    Object.assign(this, fields);
    this.className = 'messages.SendMultiMedia';
  }
}
class GetHistory {
  constructor() {
    this.className = 'messages.GetHistory';
  }
}

// ---- 1. Effects on file sends ------------------------------------------

test('withEffect stamps media sends only, and keeps what is set', async () => {
  const seen = [];
  const client = { invoke: async (request) => seen.push(request) };
  const wrapped = withEffect(client, 77n);
  await wrapped.invoke(new SendMedia({}));
  await wrapped.invoke(new SendMultiMedia({}));
  await wrapped.invoke(new GetHistory());
  await wrapped.invoke(new SendMedia({ effect: 5n }));
  assert.deepEqual(
    seen.map((r) => r.effect),
    [77n, 77n, undefined, 5n]
  );
  assert.equal(withEffect(client, null), client, 'no effect: the same client');
});

class CustomFile {
  constructor(name, size, path) {
    Object.assign(this, { name, size, path });
  }
}

const sender = () => {
  const requests = [];
  const client = {
    // Like GramJS's sendFile: one request per batch through invoke.
    async sendFile(_peer, options) {
      const files = [options.file].flat();
      await this.invoke(
        files.length > 1 ? new SendMultiMedia({}) : new SendMedia({})
      );
      return files.map((_f, i) => ({ id: requests.length * 10 + i + 1 }));
    },
    async invoke(request) {
      requests.push(request);
    },
  };
  const env = {
    store: createMemoryStore(),
    importer: async () => ({
      Api: {},
      helpers: { returnBigInt: BigInt },
      client: { uploads: { CustomFile } },
    }),
    connection: { withPeer: (_c, chat, use) => use(`peer:${chat}`) },
  };
  const files = createFileSender(env, {
    userClient: async () => client,
    dialogOf: async (chat) => ({ id: chat, isUser: true }),
    tools: { toLinks: telegramDialogLinks, writeChanged: async () => 0 },
  });
  const up = async (name) =>
    (await files.receiveUpload(Readable.from([Buffer.from('x')]), { name }))
      .token;
  return { files, requests, up };
};

test('sendFiles gives the first batch the effect as a long, others none', async () => {
  const { files, requests, up } = sender();
  const tokens = [await up('a.jpg'), await up('b.jpg'), await up('c.txt')];
  const answer = await files.sendFiles({
    chat: '42',
    tokens,
    effect: '5104841245755180586',
    asPhoto: true,
    group: true,
  });
  assert.equal(answer.ok, true);
  // Two batches: the photos as one album, the text file alone.
  assert.equal(requests.length, 2);
  assert.equal(requests[0].className, 'messages.SendMultiMedia');
  assert.equal(requests[0].effect, 5104841245755180586n);
  assert.equal(requests[1].effect, undefined);
});

test('sendFiles without an effect sends none', async () => {
  const { files, requests, up } = sender();
  await files.sendFiles({ chat: '42', tokens: [await up('a.txt')] });
  assert.equal(requests.length, 1);
  assert.equal('effect' in requests[0], false);
});

test('send-files takes an effect id as a decimal string only', async () => {
  const seen = [];
  const account = {
    sendFiles: async (body) => {
      seen.push(body);
      return { ok: true };
    },
  };
  const base = { chat: '42', tokens: ['a'.repeat(32)] };
  assert.equal(
    await postRoute('send-files', { ...base, effect: '123' }, account),
    200
  );
  assert.equal(seen[0].effect, '123');
  assert.equal(await postRoute('send-files', base, account), 200);
  assert.equal('effect' in seen[1], false);
  for (const bad of [123, 'abc', '1e5', '', {}]) {
    assert.equal(
      await postRoute('send-files', { ...base, effect: bad }, account),
      400,
      `refused: ${JSON.stringify(bad)}`
    );
  }
});

// ---- 2. Join requests live ---------------------------------------------

const pendingUpdate = (extra = {}) => ({
  className: 'UpdatePendingJoinRequests',
  peer: { className: 'PeerChannel', channelId: 5n },
  requestsPending: 3,
  recentRequesters: [11n, 12n],
  ...extra,
});

test('updatePendingJoinRequests becomes a requests effect', () => {
  const entities = new Map();
  const effect = updateEffect(pendingUpdate({ _entities: entities }));
  assert.deepEqual(effect, {
    kind: 'requests',
    chat: '-1005',
    pending: 3,
    recent: ['11', '12'],
    entities,
  });
  assert.equal(
    updateEffect(pendingUpdate({ requestsPending: 0, recentRequesters: [] }))
      .pending,
    0
  );
});

test('the live writer keeps one requests link per chat, named from entities', async () => {
  const store = createMemoryStore();
  await store.put({ id: 'person:telegram:12', name: 'Known Person' });
  const live = createTelegramLive({
    store,
    toLinks: telegramDialogLinks,
    now: () => 1_760_000_000_000,
  });
  const entities = new Map([['11', { firstName: 'Ann', lastName: 'Lee' }]]);
  await live.handle({}, pendingUpdate({ _entities: entities }));
  const link = await store.get(requestsLinkId('-1005'));
  assert.equal(link.id, 'requests:telegram:-1005');
  assert.equal(link.pending, 3);
  assert.deepEqual(link.recent, [
    { id: '11', name: 'Ann Lee' },
    { id: '12', name: 'Known Person' },
  ]);
  await live.handle(
    {},
    pendingUpdate({ requestsPending: 0, recentRequesters: [] })
  );
  const after = await store.get(requestsLinkId('-1005'));
  assert.equal(after.pending, 0);
  assert.deepEqual(after.recent, []);
});

test('the event stream carries requests links', () => {
  assert.equal(isStreamedId('requests:telegram:-1005'), true);
});

test('the page takes the live link over what the chat info read', () => {
  const chat = { source: 'telegram', chat: '-1005' };
  const link = {
    id: 'requests:telegram:-1005',
    pending: 4,
    recent: [{ id: '1' }],
  };
  assert.equal(requestsLinkOf([link], chat), link);
  assert.equal(requestsLinkOf([link], { ...chat, chat: '-1006' }), null);
  assert.equal(requestsLinkOf(null, chat), null);
  const info = { requestsPending: 2, recentRequesters: [{ id: '9' }] };
  assert.deepEqual(requestsShown(info, null), {
    pending: 2,
    recent: [{ id: '9' }],
  });
  assert.deepEqual(requestsShown(info, link), {
    pending: 4,
    recent: [{ id: '1' }],
  });
  assert.equal(requestsShown(info, { ...link, pending: 0 }).pending, 0);
  assert.equal(requestsShown({}, null).pending, 0);
});

// ---- 3. Topic links -----------------------------------------------------

const forum = (extra = {}) => ({
  forum: true,
  loaded: true,
  topic: null,
  topics: [{ id: 2 }, { id: 6 }],
  ...extra,
});

test('links name the topic or the topic itself', () => {
  assert.deepEqual(parseMessageLink('https://t.me/c/9/2/5'), {
    channel: '9',
    username: null,
    id: 5,
    thread: 2,
  });
  assert.deepEqual(parseMessageLink('https://t.me/somegroup/2/5'), {
    channel: null,
    username: 'somegroup',
    id: 5,
    thread: 2,
  });
  // One number after the chat: a message, or a topic's own id.
  assert.equal(parseMessageLink('https://t.me/c/9/6').thread, null);
});

test('an arrival opens the topic a link names, then goes to the message', () => {
  const link = { key: 'telegram:-1009', id: 5, topic: 2 };
  assert.deepEqual(arrivalStep(link, forum({ loaded: false })), { wait: true });
  assert.deepEqual(arrivalStep(link, forum()), { choose: 2 });
  assert.deepEqual(arrivalStep(link, forum({ topic: 2 })), { goto: 5 });
  // A topic the forum lacks: the message anyway.
  assert.deepEqual(arrivalStep({ ...link, topic: 9 }, forum()), { goto: 5 });
});

test('a link to a topic itself opens it and goes nowhere else', () => {
  const link = { key: 'telegram:-1009', id: 6, maybeTopic: 6 };
  assert.deepEqual(arrivalStep(link, forum()), { choose: 6 });
  assert.deepEqual(arrivalStep(link, forum({ topic: 6 })), { goto: null });
  // Not a topic of the forum: just a message.
  assert.deepEqual(arrivalStep({ ...link, id: 7, maybeTopic: 7 }, forum()), {
    goto: 7,
  });
});

test('outside a forum or without a topic an arrival is a plain jump', () => {
  assert.deepEqual(arrivalStep({ id: 5, topic: 2 }, forum({ forum: false })), {
    goto: 5,
  });
  assert.deepEqual(arrivalStep({ id: 5 }, forum()), { goto: 5 });
  assert.deepEqual(arrivalStep({ id: 5 }, undefined), { goto: 5 });
});
