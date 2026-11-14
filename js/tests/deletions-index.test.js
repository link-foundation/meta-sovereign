import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import { createChatIndex } from '../src/server/chat-index.js';
import {
  createFeedbackIndex,
  feedbackAuthorsId,
} from '../src/server/feedback-index.js';

test('payload-free deletions invalidate live, edited and soft-deleted chat indexes', async () => {
  const store = withCausalWrites(createMemoryStore(), { actor: 'a' });
  const index = createChatIndex(store);
  try {
    await index.ready();
    const message = {
      id: 'msg:one',
      source: 'telegram',
      chat: '42',
      body: 'erase',
      versionCount: 2,
    };
    await store.put(message);
    assert.equal(index.count('telegram:42'), 1);
    await store.put({ ...message, deleted: true });
    assert.deepEqual(await index.deleted('telegram:42'), [message.id]);
    assert.deepEqual(await index.edited('telegram:42'), [message.id]);
    const revision = index.revision('telegram:42');
    await store.delete(message.id);
    assert.deepEqual(await index.deleted('telegram:42'), []);
    assert.deepEqual(await index.edited('telegram:42'), []);
    assert.equal(index.count('telegram:42'), 0);
    assert.ok(index.revision('telegram:42') > revision);
  } finally {
    index.close();
  }
});

test('payload-free deletion removes collected feedback and marks its known sparse row deleted', () => {
  const index = createFeedbackIndex(createMemoryStore());
  try {
    const message = {
      id: 'msg:one',
      source: 'telegram',
      chat: '42',
      sender: 'me',
      feedback: { counts: [{ emoji: 'x', count: 1 }] },
    };
    index.observe(message);
    const previous = index.row(message.id);
    index.observe({
      id: feedbackAuthorsId(message.id),
      messageId: message.id,
      actors: [],
    });
    index.observe({ id: feedbackAuthorsId(message.id) }, true);
    assert.equal(index.collected(message.id), null);
    index.observe({ id: message.id }, true, true);
    assert.deepEqual(index.row(message.id), { ...previous, deleted: true });
    assert.equal(index.nextCollection(Date.now()), null);
  } finally {
    index.close();
  }
});
