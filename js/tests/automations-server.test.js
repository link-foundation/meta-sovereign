// Issue #31 / PR #34: automations, the chat composer's send (API, then
// the official web UI) and typing status over HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/index.js';
import { DAY_MS } from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import { startServer } from '../src/server/index.js';

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

const boot = async () => {
  const store = createMemoryStore();
  for (const link of [
    m('101', 'me', 'Привет! Как ты?', 125),
    m('101', 'alice', 'Норм, а ты что делаешь?', 120),
    m('102', 'me', 'Здравствуйте! Вы сможете прислать ваше резюме?', 200),
    m('102', 'bob', 'Да, конечно', 200),
  ]) {
    await store.put(link);
  }
  const sent = [];
  const typing = [];
  const server = await startServer({
    store,
    enableSync: false,
    enableHandlers: false,
    automations: {
      scheduler: false,
      send: async (draft) => {
        if (draft.text === 'fail') {
          throw Object.assign(new Error('captcha'), { code: 'captcha' });
        }
        sent.push(draft);
        return { via: 'browser' };
      },
      setTyping: async ({ source }) => {
        typing.push(source);
        return { supported: true, source };
      },
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { server, store, sent, typing, call };
};

test('presets are listed, saved, edited and deleted', async () => {
  const { server, call } = await boot();
  try {
    const listed = await call('GET', '/api/automations');
    const reengage = listed.body.automations.find(
      (a) => a.id === 'automation:reengage-dormant'
    );
    assert.equal(reengage.saved, false);
    const saved = await call('PUT', '/api/automations', {
      automation: { ...reengage, conditions: { silentDays: 150 } },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.conditions.silentDays, 150);
    const again = await call('GET', '/api/automations');
    assert.equal(
      again.body.automations.filter((a) => a.id === reengage.id).length,
      1
    );
    assert.equal(
      again.body.automations.find((a) => a.id === reengage.id).saved,
      true
    );
    const bad = await call('PUT', '/api/automations', { mode: 'yolo' });
    assert.equal(bad.status, 400);
    const gone = await call('DELETE', '/api/automations/reengage-dormant');
    assert.equal(gone.body.deleted, 'automation:reengage-dormant');
    const presets = await call('GET', '/api/automations/presets');
    assert.equal(presets.body.presets.length, 4);
  } finally {
    await server.close();
  }
});

test('a safe run drafts, and a draft is sent only with confirm', async () => {
  const { server, sent, typing, call } = await boot();
  try {
    const plan = await call('POST', '/api/automations/plan', {
      automation: 'reengage-dormant',
    });
    assert.equal(plan.body.total, 2);
    const run = await call('POST', '/api/automations/run', {
      automation: 'reengage-dormant',
      trigger: 'chat-menu',
      targets: [{ source: 'vk', chat: '101' }],
    });
    assert.equal(run.body.trigger, 'chat-menu');
    assert.equal(run.body.queued.length, 1);
    const { body } = await call(
      'GET',
      '/api/automations/drafts?source=vk&chat=101'
    );
    assert.equal(body.drafts.length, 1);
    const [draft] = body.drafts;
    assert.equal(draft.form, 'informal');
    const refused = await call('POST', '/api/automations/drafts/send', {
      id: draft.id,
    });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, 'confirm-required');
    const formal = await call('POST', '/api/automations/drafts/form', {
      id: draft.id,
      form: 'formal',
    });
    assert.match(formal.body.text, /^Здравствуйте/);
    const done = await call('POST', '/api/automations/drafts/send', {
      id: draft.id,
      confirm: true,
    });
    assert.equal(done.body.status, 'sent');
    assert.equal(done.body.record.via, 'browser');
    assert.match(sent[0].text, /^Здравствуйте/);
    assert.deepEqual(typing, ['vk']);
    const history = await call('GET', '/api/automations/history');
    assert.equal(history.body.records.length, 1);
  } finally {
    await server.close();
  }
});

test('an auto run needs confirm for a manual trigger', async () => {
  const { server, sent, call } = await boot();
  try {
    const automation = {
      name: 'Hello fast',
      mode: 'auto',
      conditions: { silentDays: 90 },
      pacing: { typing: false, minDelayMs: 0, maxDelayMs: 0 },
    };
    const refused = await call('POST', '/api/automations/run', {
      automation,
    });
    assert.equal(refused.body.code, 'confirm-required');
    const ran = await call('POST', '/api/automations/run', {
      automation,
      confirm: true,
    });
    assert.equal(ran.body.results.length, 2);
    assert.equal(sent.length, 2);
  } finally {
    await server.close();
  }
});

test('the composer sends through /api/send and stores the message', async () => {
  const { server, store, call } = await boot();
  try {
    const ok = await call('POST', '/api/send', {
      source: 'vk',
      chat: '101',
      text: 'Как дела?',
    });
    assert.equal(ok.body.via, 'browser');
    const stored = await store.get(ok.body.link.id);
    assert.equal(stored.body, 'Как дела?');
    assert.equal(stored.sender, 'me');
    const failed = await call('POST', '/api/send', {
      source: 'vk',
      chat: '101',
      text: 'fail',
    });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.code, 'captcha');
    const bad = await call('POST', '/api/send', { source: 'vk' });
    assert.equal(bad.status, 400);
  } finally {
    await server.close();
  }
});

test('typing status is set and listed per chat', async () => {
  const { server, call } = await boot();
  try {
    const set = await call('POST', '/api/typing', {
      source: 'vk',
      chat: '101',
    });
    assert.equal(set.body.supported, true);
    const now = await call('GET', '/api/typing?source=vk&chat=101');
    assert.deepEqual(
      now.body.typing.map((t) => t.user),
      ['me']
    );
    const other = await call('GET', '/api/typing?source=vk&chat=102');
    assert.deepEqual(other.body.typing, []);
  } finally {
    await server.close();
  }
});
