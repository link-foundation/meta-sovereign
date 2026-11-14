import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedSend } from '../src/automation/outbox.js';
import { createMemoryStore } from '../src/storage/universal.js';

test('an outgoing reservation is flushed before any provider write', async () => {
  const store = createMemoryStore();
  const events = [];
  const put = store.put;
  store.put = async (value) => {
    events.push(value.status);
    return put(value);
  };
  store.flush = async () => {
    events.push('durable');
  };
  const result = await guardedSend({
    store,
    owner: 'flush-probe',
    draft: { source: 'hh', chat: '7', text: 'A known reply' },
    send: async () => {
      events.push('provider');
      return { messageId: '102' };
    },
  });
  assert.equal(result.status, 'sent');
  assert.deepEqual(events, ['sending', 'durable', 'provider', 'sent']);
});

test('a failed reservation flush cannot dispatch or claim delivery', async () => {
  const store = createMemoryStore();
  let writes = 0;
  store.flush = async () => {
    throw new Error('Synthetic disk sync failure');
  };
  const result = await guardedSend({
    store,
    owner: 'flush-refusal',
    draft: { source: 'hh', chat: '7', text: 'A known reply' },
    send: async () => {
      writes++;
    },
  });
  assert.equal(writes, 0);
  assert.equal(result.code, 'outbox-unavailable');
  assert.equal(result.status, 'failed');
});
