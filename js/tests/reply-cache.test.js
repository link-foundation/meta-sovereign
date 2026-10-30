// R-Y70: the browser answers keystrokes from its own copy of the reply
// index. The server gives the index as links (pruned for a browser) and,
// to a copy that holds a version, only the messages learned since; the
// copy is kept between visits and suggests before the server answers.
// Synthetic messages and fakes only — nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate, setTimeout } from 'node:timers';
import { gunzipSync } from 'node:zlib';

import { createMemoryStore } from '../src/storage/index.js';
import { createInMemoryDriver } from '../src/storage/browser-store.js';
import { createReplyService } from '../src/replies/reply-service.js';
import {
  createReplyCache,
  mergeSuggestions,
} from '../src/replies/reply-cache.js';
import { buildReplyIndex } from '../src/replies/reply-graph.js';
import { parseLinoRecords } from '../src/storage/lino-store.js';
import { handleSuggestRoutes } from '../src/server/routes-suggest.js';

let seq = 0;
const BASE = Date.now() - 60 * 60_000;
const msg = (chat, sender, body, minute) => ({
  id: `msg:vk:${++seq}`,
  source: 'vk',
  chat,
  sender,
  body,
  timestamp: new Date(BASE + minute * 60_000).toISOString(),
});

const HISTORY = () => [
  msg('1', 'u1', 'Привет!', 0),
  msg('1', 'me', 'Привет, как дела?', 1),
  msg('2', 'u2', 'привет', 0),
  msg('2', 'me', 'Привет, как дела?', 2),
  msg('3', 'u3', 'Привет', 0),
  msg('3', 'me', 'Здравствуйте! Как ваши дела сегодня?', 3),
  msg('5', 'me', 'Как ваши дела сегодня? Хорошо', 4),
  msg('4', 'u4', 'Привет', 5),
];

const seeded = async () => {
  const store = createMemoryStore();
  for (const m of HISTORY()) {
    await store.put(m);
  }
  return store;
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

const texts = (result) => result.suggestions.map((s) => [s.kind, s.text]);

test('suggestions remove duplicates within either source and across reply/word types', () => {
  const local = {
    suggestions: [
      { kind: 'reply', text: 'Hello' },
      { kind: 'reply', text: ' hello ' },
      { kind: 'word', text: 'hello' },
      { kind: 'word', text: 'Thanks' },
      { kind: 'word', text: 'thanks' },
    ],
  };
  const remote = {
    suggestions: [
      { kind: 'reply', text: 'HELLO' },
      { kind: 'reply', text: 'Welcome' },
      { kind: 'reply', text: 'welcome' },
    ],
  };
  assert.deepEqual(
    mergeSuggestions(local, remote).suggestions.map((s) => s.text),
    ['Hello', 'Welcome', 'Thanks']
  );
  assert.deepEqual(
    mergeSuggestions(null, remote).suggestions.map((s) => s.text),
    ['HELLO', 'Welcome']
  );
});

const INPUTS = ['', 'При', 'Зд', 'Как ваши ', 'Как ваши д', 'Хор'];

test('long suggestions deduplicate full messages while retaining different endings', () => {
  const prefix = 'Привет! Хотел обсудить помощь с новым проектом. '.repeat(6);
  const first = `${prefix}Встречаемся в понедельник?`;
  const second = `${prefix}Встречаемся во вторник?`;
  const third = `${prefix}Встречаемся в среду?`;
  const local = {
    suggestions: [
      { kind: 'message', text: first },
      { kind: 'message', text: first },
      { kind: 'message', text: second },
    ],
  };
  const remote = {
    suggestions: [
      { kind: 'reply', text: first.toUpperCase().replaceAll('!', ',') },
      { kind: 'message', text: second },
      { kind: 'message', text: third },
    ],
  };
  assert.deepEqual(
    mergeSuggestions(local, remote).suggestions.map((s) => s.text),
    [first, second, third]
  );
});

test('the whole index goes out as links and comes back the same', () => {
  const links = HISTORY();
  const index = buildReplyIndex(links);
  const model = index.modelLinks();
  const kinds = new Set(model.map((l) => l.id.split(':')[0]));
  for (const kind of [
    'reply-link',
    'sent-link',
    'word-link',
    'spelling-link',
    'chat-link',
    'last-link',
  ]) {
    assert.ok(kinds.has(kind), kind);
  }
  assert.ok(model.every((l) => Array.isArray(l.tokens) && l.id));
  const copy = buildReplyIndex([]).fromLinks(model);
  for (const typed of INPUTS) {
    assert.deepEqual(
      texts(copy.autocomplete({ lastMessage: 'Привет', typed })),
      texts(index.autocomplete({ lastMessage: 'Привет', typed })),
      `typed ${JSON.stringify(typed)}`
    );
  }
  assert.deepEqual(copy.lastIn('vk', '4').body, 'Привет');
});

test('pruned for a browser: rare words and one-off replies stay home', () => {
  const index = buildReplyIndex(HISTORY());
  const model = index.modelLinks({
    reply: (count) => count >= 2,
    sent: (count) => count >= 2,
    word: (count) => count >= 4,
    perContext: 1,
  });
  const replies = model.filter((l) => l.id.startsWith('reply-link:'));
  assert.deepEqual(
    replies.map((l) => [l.reply, l.count]),
    [['Привет, как дела?', 2]]
  );
  assert.equal(model.filter((l) => l.id.startsWith('sent-link:')).length, 1);
  for (const l of model.filter((x) => x.id.startsWith('word-link:'))) {
    assert.ok(l.words.every(([, count]) => count >= 4));
    assert.ok(l.n === 1 || l.words.length <= 1);
  }
});

test('the server gives the model, then only what it learned since', async () => {
  const store = await seeded();
  const service = createReplyService({ store });
  const whole = await service.model();
  assert.match(whole.version, /^[a-z0-9]+\.0$/);
  assert.ok(whole.links.length > 0);
  assert.deepEqual(whole.self, ['me']);
  const same = await service.model({ since: whole.version });
  assert.deepEqual(same, { version: whole.version, changes: [] });
  const next = msg('4', 'me', 'Привет, как дела?', 6);
  await store.put(next);
  const since = await service.model({ since: whole.version });
  assert.match(since.version, /\.1$/);
  assert.deepEqual(
    since.changes.map((m) => [m.id, m.body]),
    [[next.id, next.body]]
  );
  // A version not ours (a rebuilt index, a stranger): the whole model.
  assert.ok((await service.model({ since: 'other.3' })).links);
  await service.close();
});

const serving = (service) => (request) => service.model(request);

test('the browser copy suggests as the server does, and keeps up', async () => {
  const store = await seeded();
  const service = createReplyService({ store });
  const driver = createInMemoryDriver();
  const cache = createReplyCache({
    fetchModel: serving(service),
    driver,
    nudgeMs: 0,
    saveMs: 0,
  });
  assert.equal(cache.autocomplete({ source: 'vk', chat: '4' }), null);
  await cache.start();
  assert.ok(cache.ready());
  for (const typed of INPUTS) {
    const server = await service.autocomplete({
      source: 'vk',
      chat: '4',
      typed,
    });
    const local = cache.autocomplete({ source: 'vk', chat: '4', typed });
    // Whole messages as the server's; rare words stay on the server.
    const whole = (result) => texts(result).filter(([kind]) => kind !== 'word');
    assert.deepEqual(whole(local), whole(server), JSON.stringify(typed));
    assert.equal(local.backend, 'browser');
  }
  // We answered chat 4: nothing waits there; the server streams it.
  const before = cache.revision();
  await store.put(msg('4', 'me', 'Здравствуйте! Как ваши дела сегодня?', 6));
  cache.nudge();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await cache.sync();
  assert.ok(cache.revision() > before);
  assert.equal(cache.toAnswer({ source: 'vk', chat: '4' }), '');
  // The screen may know a newer message than the copy.
  const hint = msg('4', 'u4', 'Привет', 7);
  assert.equal(cache.toAnswer({ source: 'vk', chat: '4', hint }), 'Привет');
  assert.deepEqual(
    texts(cache.autocomplete({ source: 'vk', chat: '4', hint })),
    // The answer streamed in made it typical too; the newer goes first.
    [
      ['reply', 'Здравствуйте! Как ваши дела сегодня?'],
      ['reply', 'Привет, как дела?'],
    ]
  );
  await cache.flush();
  // The next visit suggests from what was kept, before the server answers.
  const offline = createReplyCache({
    fetchModel: () => new Promise(() => {}),
    driver,
  });
  offline.start();
  for (let i = 0; i < 20 && !offline.ready(); i += 1) {
    await settle();
  }
  assert.ok(offline.ready());
  assert.deepEqual(
    texts(offline.autocomplete({ source: 'vk', chat: '4', hint })),
    // The answer streamed in made it typical too; the newer goes first.
    [
      ['reply', 'Здравствуйте! Как ваши дела сегодня?'],
      ['reply', 'Привет, как дела?'],
    ]
  );
  assert.equal(offline.version(), cache.version());
  await service.close();
});

test('a message long past answering gets nothing from the copy', async () => {
  const service = createReplyService({ store: await seeded() });
  const cache = createReplyCache({
    fetchModel: serving(service),
    now: () => Date.now() + 8 * 24 * 60 * 60_000,
  });
  await cache.start();
  assert.equal(cache.toAnswer({ source: 'vk', chat: '4' }), '');
  await service.close();
});

test('the server adds what the copy lacks; the copy keeps its order', () => {
  const local = {
    stage: 'reply',
    suggestions: [
      { kind: 'reply', text: 'Привет, как дела?' },
      { kind: 'word', text: 'Привет всем' },
    ],
  };
  const remote = {
    stage: 'reply',
    suggestions: [
      { kind: 'reply', text: 'привет, как дела' },
      { kind: 'message', text: 'Привет, редкое' },
      { kind: 'word', text: 'Привет мир' },
    ],
  };
  assert.deepEqual(
    mergeSuggestions(local, remote).suggestions.map((s) => s.text),
    ['Привет, как дела?', 'Привет, редкое', 'Привет всем']
  );
  assert.deepEqual(mergeSuggestions(local, null), local);
  // Words the copy does not know come from the server.
  assert.deepEqual(
    mergeSuggestions(
      { stage: 'none', suggestions: [] },
      remote
    ).suggestions.map((s) => s.text),
    ['привет, как дела', 'Привет, редкое', 'Привет мир']
  );
  assert.deepEqual(mergeSuggestions(null, remote), remote);
});

const fakeResponse = () => {
  const res = { headers: null, body: null, headersSent: false };
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers;
  };
  res.end = (body) => {
    res.body = body;
    res.writableEnded = true;
  };
  return res;
};

test('GET /api/suggest/model: compressed JSON, or Links Notation', async () => {
  const replies = createReplyService({ store: await seeded() });
  const ask = async (query, headers = {}) => {
    const res = fakeResponse();
    const url = new URL(`http://x/api/suggest/model${query}`);
    await handleSuggestRoutes(
      { method: 'GET', headers },
      res,
      url.pathname,
      url,
      {
        replies,
      }
    );
    return res;
  };
  const zipped = await ask('', { 'accept-encoding': 'gzip, br' });
  assert.equal(zipped.headers['content-encoding'], 'gzip');
  const model = JSON.parse(gunzipSync(zipped.body).toString('utf8'));
  assert.ok(model.version && model.links.length > 0);
  const lino = await ask('?format=lino');
  assert.match(lino.headers['content-type'], /^text\/plain/);
  const records = parseLinoRecords(String(lino.body));
  assert.equal(records.length, model.links.length);
  assert.deepEqual(
    texts(
      buildReplyIndex([])
        .fromLinks(records)
        .autocomplete({ lastMessage: 'Привет', typed: 'При' })
    ),
    texts(
      buildReplyIndex([])
        .fromLinks(model.links)
        .autocomplete({ lastMessage: 'Привет', typed: 'При' })
    )
  );
  const since = JSON.parse(String((await ask(`?since=${model.version}`)).body));
  assert.deepEqual(since, { version: model.version, changes: [] });
  await replies.close();
});
