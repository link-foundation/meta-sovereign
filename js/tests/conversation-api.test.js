import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import { CONVERSATION_SETTINGS_ID } from '../src/crm/conversation-policy.js';
import { acquaintanceConversation } from './helpers/conversation-fixture.js';

test('cached knowledge, selected-reply suggestions and persistent opt-outs work together without provider reads or sends', async () => {
  const store = createMemoryStore();
  const messages = acquaintanceConversation();
  await store.putMany(messages.slice(0, 7));
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-conversation-api-'));
  let sends = 0;
  const server = await startServer({
    store,
    storeDir: dir,
    port: 0,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    log: null,
    automations: {
      scheduler: false,
      send: async () => {
        sends++;
        return { via: 'fixture' };
      },
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const get = async (route) => (await fetch(base + route)).json();
  try {
    const settings = await get('/api/people/learning-settings');
    assert.deepEqual(settings, {
      enabled: true,
      facts: true,
      questions: true,
      suggestions: true,
    });
    const reply = await get(
      '/api/suggest?source=telegram&chat=111&replyTo=4&locale=ru'
    );
    assert.equal(reply.stage, 'context', JSON.stringify(reply));
    assert.equal(reply.context.question.id, messages[1].id);
    assert(reply.suggestions.some((item) => item.rule === 'work.github'));
    await store.putMany(messages.slice(7));
    const facts = await get('/api/people/learned?key=telegram:111&cached=1');
    assert.equal(facts.relationships[0].status, 'agreed');
    assert.equal(facts.address.form, 'informal');
    assert.equal(facts.accounts[0].handle, 'example-developer');
    assert(
      facts.summary.continuations.some(
        (edge) => edge.from === 'work' && edge.network === 'github'
      )
    );
    assert(facts.theirAsked.length > 0);
    const after = await get('/api/suggest?source=telegram&chat=111&replyTo=4');
    assert(!after.suggestions.some((item) => item.rule === 'work.github'));
    assert(after.suggestions.some((item) => item.rule === 'work.projects'));
    const saved = await fetch(`${base}/api/people/learning-settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await store.get(CONVERSATION_SETTINGS_ID)).enabled, false);
    assert.equal(
      (await get('/api/people/learned?key=telegram:111&cached=1')).disabled,
      true
    );
    assert.equal(
      (await get('/api/suggest?source=telegram&chat=111&replyTo=4')).context,
      null
    );
    assert.equal(
      (
        await fetch(`${base}/api/people/learning-settings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: 'off' }),
        })
      ).status,
      400
    );
    assert.equal(sends, 0);
    assert.equal(
      await store.size(),
      messages.length + 1,
      'analysis adds no duplicate fact or message records'
    );
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
