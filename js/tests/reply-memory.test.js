import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createBoundedHistory } from '../src/replies/bounded-history.js';
import { createReplyService } from '../src/replies/reply-service.js';
import { createReplyContext } from '../src/replies/reply-context.js';

const message = (number, sender = 'me', extra = {}) => ({
  id: `msg:telegram:42:${number}`,
  source: 'telegram',
  chat: '42',
  body: `unique words ${number}`,
  sender,
  timestamp: new Date(number * 1000).toISOString(),
  ...extra,
});

test('suggestion history has hard count/byte bounds and selects recent messages from out-of-order backfill', () => {
  const history = createBoundedHistory({ maxMessages: 3, maxBytes: 2000 });
  for (const number of [20, 4, 19, 5, 18, 6]) {
    history.add(message(number));
  }
  assert.deepEqual(
    history
      .values()
      .map((m) => m.id)
      .sort(),
    [18, 19, 20].map((n) => message(n).id)
  );
  history.add(message(19, 'me', { body: 'edited' }));
  assert.equal(history.stats().messages, 3);
  assert.equal(history.get(message(19).id).body, 'edited');
  history.remove(message(18).id);
  assert.equal(history.stats().messages, 2);
  for (let i = 30; i < 50; i += 1) {
    history.add(message(i, 'me', { body: 'x'.repeat(600) }));
  }
  assert.ok(history.stats().bytes <= 2000);
  history.clear();
  assert.equal(history.stats().bytes, 0);
});

test('reply bootstrap and live rebuilds use lightweight bounded records without decoding raw payloads', async () => {
  const store = createMemoryStore({
    retain: (link) =>
      Object.defineProperty({ ...link }, 'raw', {
        enumerable: true,
        get: () => {
          throw new Error('raw payload was materialized');
        },
      }),
  });
  for (let i = 1; i <= 20; i += 1) {
    await store.put(message(i, i % 2 ? 'peer' : 'me'));
  }
  await store.put(message(0, 'peer', { chat: 'old', body: 'older context' }));
  const service = createReplyService({
    store,
    historyBudget: { maxMessages: 3, maxBytes: 4096 },
    now: () => 21000,
  });
  try {
    let stats = await service.stats();
    assert.equal(stats.history.own.messages, 3);
    assert.equal(stats.history.other.messages, 3);
    assert.equal(store.size(), 21, 'the archive keeps every message');
    assert.equal(
      (await service.lastIncoming({ source: 'telegram', chat: 'old' })).body,
      'older context',
      'context outside the learning window loads without raw payloads'
    );
    await store.put(message(21, 'peer'));
    await store.put(message(22, 'me'));
    await store.put(message(22, 'me', { body: 'edited reply' }));
    stats = await service.stats();
    assert.equal(stats.history.own.messages, 3);
    assert.ok(
      (await service.model()).links.some((link) => link.text === 'edited reply')
    );
    await store.put(message(22, 'me', { body: 'x'.repeat(5000) }));
    assert.ok(
      !(await service.model()).links.some(
        (link) => link.text === 'edited reply'
      ),
      'oversized replacement drops the stale suggestion'
    );
  } finally {
    await service.close();
  }
});

test('a bounded context preserves message order within one second and releases on close', () => {
  const context = createReplyContext({
    isSelf: (sender) => sender === 'me',
    now: () => 1000,
    windowMs: 5000,
    limit: 2,
    maxBytes: 2048,
  });
  context.remember(message(100, 'me', { timestamp: '1970-01-01T00:00:01Z' }));
  context.remember(message(99, 'peer', { timestamp: '1970-01-01T00:00:01Z' }));
  assert.equal(
    context.toAnswer('telegram', '42'),
    '',
    'an older incoming message does not replace the sent message'
  );
  for (let i = 1; i < 10; i += 1) {
    context.remember(message(i, 'peer', { chat: String(i) }));
  }
  assert.equal(context.stats().last.messages, 2);
  assert.equal(context.stats().incoming.messages, 2);
  context.clear();
  assert.equal(context.stats().last.bytes, 0);
});
