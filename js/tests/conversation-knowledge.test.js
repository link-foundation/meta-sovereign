import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createChatIndex } from '../src/server/chat-index.js';
import { createConversationKnowledge } from '../src/server/conversation-knowledge.js';
import { CONVERSATION_SETTINGS_ID } from '../src/crm/conversation-policy.js';
import { acquaintanceConversation } from './helpers/conversation-fixture.js';

test('knowledge reads only projected message fields and invalidates facts after in-place edits', async () => {
  const retained = [];
  const store = createMemoryStore({
    retain: (link) => {
      const saved = { ...link };
      retained.push(saved);
      return saved;
    },
    copy: (link) => {
      assert(
        !link.id.startsWith('msg:'),
        'messages must use the projection, never detach cold payloads'
      );
      return { ...link };
    },
  });
  const messages = acquaintanceConversation();
  await store.putMany(messages);
  const index = createChatIndex(store);
  await index.ready();
  for (const message of retained) {
    Object.defineProperty(message, 'raw', {
      enumerable: true,
      get() {
        throw new Error('cold payload decoded');
      },
    });
  }
  const logs = [];
  const knowledge = createConversationKnowledge({
    store,
    index,
    log: (entry) => logs.push(entry),
  });
  const first = await knowledge.get('telegram:111');
  assert(
    first.learned.work.some(
      (fact) => fact.profession === 'programmer' && !fact.negated
    )
  );
  assert.equal(first.learned.relationships.length, 1);
  const repeated = await knowledge.get('telegram:111');
  assert.equal(repeated.learned, first.learned);
  assert.equal(
    logs.length,
    1,
    'same conversation is not analyzed on every request'
  );
  await store.put({ ...messages[3], body: 'Нет' });
  const changed = await knowledge.get('telegram:111');
  assert(
    changed.learned.work.some(
      (fact) => fact.profession === 'programmer' && fact.negated
    )
  );
  await store.put({ ...messages[6], body: 'Нет' });
  assert.equal(
    (await knowledge.get('telegram:111')).learned.relationships.length,
    0
  );
  assert.equal(index.count('telegram:111'), messages.length);
  assert.equal(JSON.stringify(logs).includes('example-developer'), false);
  assert.equal(JSON.stringify(logs).includes('программист'), false);
  knowledge.close();
  index.close();
  assert.deepEqual(knowledge.stats(), { cachedChats: 0, bytes: 0, pending: 0 });
});

test('turning learning off bypasses history and all derived rules', async () => {
  const store = createMemoryStore();
  await store.put({ id: CONVERSATION_SETTINGS_ID, enabled: false });
  const knowledge = createConversationKnowledge({
    store,
    index: {
      ready: () => assert.fail('disabled learning must not read history'),
    },
  });
  assert.equal((await knowledge.get('telegram:111')).disabled, true);
  assert.deepEqual(await knowledge.suggest('telegram:111', { replyTo: '4' }), {
    suggestions: [],
    context: null,
  });
  knowledge.close();
});

test('visiting different conversations keeps both cache count and bytes bounded', async () => {
  const store = createMemoryStore();
  for (const chat of ['111', '222', '333']) {
    await store.putMany(
      acquaintanceConversation().map((message) => ({
        ...message,
        chat,
        id: message.id.replace(':111:', `:${chat}:`),
        replyTo: message.replyTo?.replace('111:', `${chat}:`),
      }))
    );
  }
  const index = createChatIndex(store);
  const knowledge = createConversationKnowledge({
    store,
    index,
    maxChats: 2,
    maxBytes: 200_000,
  });
  for (const chat of ['111', '222', '333']) {
    await knowledge.get(`telegram:${chat}`);
  }
  assert.equal(knowledge.stats().cachedChats, 2);
  assert(knowledge.stats().bytes <= 200_000);
  knowledge.close();
  index.close();
});

test('an old selected answer outside the analysis window can still resume its original thread', async () => {
  const store = createMemoryStore();
  const messages = acquaintanceConversation();
  await store.putMany(messages);
  const index = createChatIndex(store);
  const knowledge = createConversationKnowledge({
    store,
    index,
    maxMessages: 3,
  });
  const summary = await knowledge.get('telegram:111');
  assert.equal(summary.truncated, true);
  const suggested = await knowledge.suggest('telegram:111', {
    replyTo: '4',
    locale: 'ru',
  });
  assert.equal(suggested.context.question.id, messages[1].id);
  assert.equal(suggested.context.intent, 'work');
  assert.equal(suggested.suggestions[0].rule, 'work.projects');
  knowledge.close();
  index.close();
});

test('group and bot messages do not become a personal profile', async () => {
  for (const chatType of ['supergroup', 'bot_chat', 'channel']) {
    const store = createMemoryStore();
    await store.putMany(
      acquaintanceConversation().map((message) => ({ ...message, chatType }))
    );
    const index = createChatIndex(store);
    const knowledge = createConversationKnowledge({ store, index });
    assert.equal((await knowledge.get('telegram:111')).personal, false);
    assert.deepEqual((await knowledge.suggest('telegram:111')).suggestions, []);
    knowledge.close();
    index.close();
  }
});
