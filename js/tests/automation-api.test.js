// Issue #31 / PR #34: the SPA's automation calls work from the browser's
// own links when no server is up, and keep the server's answer (and its
// error) when one is.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/index.js';
import { DAY_MS } from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import {
  createAutomationApi,
  listAutomations,
} from '../src/web/automation-api.js';

const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();
let seq = 0;
const m = (chat, sender, body, ago) =>
  buildMessageLink({
    source: 'vk',
    externalId: String((seq += 1)),
    sender,
    chat,
    body,
    timestamp: daysAgo(ago),
  });

const offline = {
  get: async () => null,
  post: async () => null,
  report: async () => null,
  put: async () => null,
  del: async () => null,
};

const seeded = async () => {
  const store = createMemoryStore();
  for (const link of [
    m('101', 'me', 'Привет! Как ты?', 125),
    m('101', 'alice', 'Норм, а ты что делаешь?', 120),
    m('102', 'me', 'Здравствуйте! Вы сможете помочь?', 200),
    m('102', 'bob', 'Да, конечно', 200),
    m('103', 'me', 'Привет', 3),
    m('103', 'carol', 'Привет!', 3),
  ]) {
    await store.put(link);
  }
  return store;
};

test('offline: presets, a chat-menu test, and a draft settled locally', async () => {
  const store = await seeded();
  const api = createAutomationApi({ remote: offline, store });
  const listed = await api.automations();
  assert.equal(
    listed.find((a) => a.preset === 'reengage-dormant').saved,
    false
  );

  const run = await api.runAutomation({
    automation: 'reengage-dormant',
    trigger: 'chat-menu',
    test: true,
    targets: [{ source: 'vk', chat: '103' }],
  });
  assert.equal(run.queued.length, 1);
  const [draft] = await api.drafts({ source: 'vk', chat: '103' });
  assert.match(draft.text, /^Привет\n/);

  const formal = await api.draftAction('form', {
    id: draft.id,
    form: 'formal',
  });
  assert.match(formal.text, /^Здравствуйте\n/);
  // Delivering needs the adapters, so offline it says so…
  const send = await api.draftAction('send', { id: draft.id });
  assert.equal(send.code, 'server-required');
  // …and the user can send it themselves and mark it.
  const marked = await api.draftAction('mark', { id: draft.id });
  assert.equal(marked.record.manual, true);
  assert.deepEqual(await api.drafts({ source: 'vk', chat: '103' }), []);
  const history = await api.automationHistory();
  assert.equal(history.length, 1);
  // The preset was kept so the draft could be settled against it.
  assert.equal(
    listAutomations(await store.query()).find(
      (a) => a.preset === 'reengage-dormant'
    ).saved,
    true
  );
});

test('offline: auto mode refuses, the composer stores, typing shows', async () => {
  const store = await seeded();
  const api = createAutomationApi({ remote: offline, store });
  const auto = await api.runAutomation({
    automation: { name: 'Fast', mode: 'auto' },
  });
  assert.equal(auto.code, 'server-required');
  const sent = await api.sendMessage({
    source: 'vk',
    chat: '101',
    text: 'Как дела?',
  });
  assert.equal(sent.status, 'stored');
  assert.equal((await store.get(sent.link.id)).body, 'Как дела?');
  await api.setTyping({ source: 'vk', chat: '101' });
  const typing = await api.typing({ source: 'vk', chat: '101' });
  assert.deepEqual(
    typing.map((t) => t.user),
    ['me']
  );
});

test('offline: people search, lists and audiences', async () => {
  const store = await seeded();
  const api = createAutomationApi({ remote: offline, store });
  const found = await api.people({ q: 'alice' });
  assert.equal(found[0].key, 'vk:alice');
  const { list } = await api.saveList({
    id: 'skip',
    name: 'Skip',
    members: ['vk:bob'],
  });
  // Saving it again under its whole id keeps the id.
  const again = await api.saveList({
    ...list,
    members: ['vk:bob', 'vk:carol'],
  });
  assert.equal(again.list.id, 'list:skip');
  const saved = await api.saveAudience({
    name: 'Personal but not skipped',
    spec: 'personal - list:skip',
  });
  assert.equal(saved.audience.id, 'audience:personal-but-not-skipped');
  const resolved = await api.resolveAudience({
    spec: 'audience:personal-but-not-skipped',
  });
  assert.deepEqual(
    resolved.people.map((p) => p.key),
    ['vk:alice']
  );
  const bad = await api.resolveAudience({ spec: 'nonsense:1' });
  assert.equal(bad.status, 'failed');
  assert.equal((await api.audiences()).length, 1);
  await api.deleteAudience('personal-but-not-skipped');
  assert.equal((await api.audiences()).length, 0);
});

test('online: the server answer wins and its error is kept', async () => {
  const store = await seeded();
  const calls = [];
  const remote = {
    ...offline,
    report: async (path, body) => {
      calls.push([path, body]);
      if (path === '/api/send') {
        return { error: 'captcha', code: 'captcha', httpStatus: 502 };
      }
      return { code: 'confirm-required', error: 'confirm', httpStatus: 400 };
    },
  };
  const api = createAutomationApi({ remote, store });
  const sent = await api.sendMessage({ source: 'vk', chat: '1', text: 'x' });
  assert.equal(sent.status, 'failed');
  assert.equal(sent.code, 'captcha');
  // Nothing was stored for a message the network refused.
  assert.equal(
    (await store.query()).filter((l) => l.id.includes(':out-')).length,
    0
  );
  const run = await api.runAutomation({ automation: 'x', confirm: false });
  assert.equal(run.code, 'confirm-required');
  assert.deepEqual(
    calls.map(([path]) => path),
    ['/api/send', '/api/automations/run']
  );
});

test('online: audiences are saved with PUT and refusals come back failed', async () => {
  const store = await seeded();
  const puts = [];
  const remote = {
    ...offline,
    put: async (path, body) => {
      puts.push(path);
      return { audience: { id: `audience:${body.name}` }, count: 3 };
    },
    report: async () => ({ error: 'unknown audience kind', httpStatus: 400 }),
  };
  const api = createAutomationApi({ remote, store });
  const saved = await api.saveAudience({ name: 'vip', spec: 'personal' });
  assert.equal(saved.count, 3);
  assert.deepEqual(puts, ['/api/audiences']);
  const bad = await api.resolveAudience({ spec: 'nonsense:1' });
  assert.equal(bad.status, 'failed');
  assert.equal(bad.error, 'unknown audience kind');
});
