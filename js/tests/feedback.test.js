import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createChatIndex } from '../src/server/chat-index.js';
import { createFeedbackService } from '../src/server/feedback-service.js';
import { createFeedbackEvidence } from '../src/server/feedback-evidence.js';
import {
  reactionData,
  rawReactionData,
  mergeReactionActors,
} from '../src/sources/reaction-data.js';
import { feedbackDirectTarget } from '../src/web/feedback-navigation.js';

const message = (id, count = 3, patch = {}) => ({
  id: `msg:telegram:-1005:${id}`,
  source: 'telegram',
  chat: '-1005',
  chatName: 'Fixture group',
  chatType: 'supergroup',
  sender: 'me',
  body: `Message ${id}`,
  timestamp: `2026-10-${String(id).padStart(2, '0')}T00:00:00.000Z`,
  raw: {
    id,
    reactions: {
      canSeeList: true,
      results: [{ reaction: { emoticon: '🔥' }, count }],
      recentReactions: [
        {
          peerId: { userId: '7' },
          reaction: { emoticon: '🔥' },
          date: 1700000000,
        },
      ],
    },
  },
  ...patch,
});
const fixture = async (messages) => {
  const store = createMemoryStore();
  for (const one of messages) {
    await store.put(one);
  }
  const index = createChatIndex(store);
  await index.ready();
  return { store, index };
};

test('reaction observations distinguish names, identities, custom and anonymous data', () => {
  const named = reactionData({
    source: 'facebook',
    reactions: [{ emoji: '👍', count: 2, by: ['Alice', 'Bob'] }],
  });
  assert.equal(named.actors[0].id, null);
  assert.equal(named.actors[0].name, 'Alice');
  assert.equal(
    named.actors[0].at,
    null,
    'a string actor has no date, despite String.prototype.at'
  );
  const raw = rawReactionData({
    reactions: {
      results: [
        { reaction: { documentId: 77n }, count: 2 },
        { reaction: { emoticon: 'x' }, count: Infinity },
      ],
      recentReactions: [
        { peerId: null, reaction: { emoticon: 'x' } },
        {
          peerId: { userId: 1n },
          reaction: { emoticon: '👍' },
          date: Infinity,
        },
      ],
    },
  });
  assert.deepEqual(raw.counts, [{ emoji: 'custom:77', count: 2 }]);
  assert.equal(raw.actors[0].at, null);
  assert.equal(raw.canSeeList, null, 'missing visibility is unknown');
  assert.equal(
    rawReactionData({
      reactions: {
        canSeeList: false,
        results: [{ reaction: { className: 'ReactionPaid' }, count: 2 }],
      },
    }).canSeeList,
    false
  );
  const merged = mergeReactionActors(
    [{ id: '1', kind: 'user', emoji: '👍', name: 'Alice', username: 'alice' }],
    [{ id: '1', kind: 'user', emoji: '👍', name: null }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Alice');
  assert.equal(merged[0].username, 'alice');
  assert.equal(
    feedbackDirectTarget('telegram', { id: '1', kind: 'user' }).chat,
    '1'
  );
  for (const actor of [
    { id: '1', kind: 'channel' },
    { id: null, kind: 'unknown' },
    { id: '1', kind: 'user', deletedAccount: true },
  ]) {
    assert.equal(feedbackDirectTarget('telegram', actor), null);
  }
});

test('sparse feedback ranks only own messages and retains evidence across updates and restarts', async () => {
  const { store, index } = await fixture([
    message(1),
    message(2, 10),
    message(3, 100, { sender: 'someone-else' }),
    message(4, 2, {
      source: 'vk',
      id: 'msg:vk:5:4',
      chat: '5',
      raw: null,
      reactions: [{ emoji: '👍', count: 2, by: ['8'] }],
    }),
  ]);
  try {
    const page = await index.feedback.list({ limit: 1 });
    assert.equal(page.total, 3);
    assert.equal(page.items[0].id, message(2).id);
    assert.equal(page.next, 1);
    assert.equal((await index.feedback.list({ source: 'vk' })).items.length, 1);
    assert.equal((await index.feedback.list({ since: '2026-10-03' })).total, 1);
    assert.equal((await index.feedback.person('telegram', '7')).total, 2);
    assert.equal((await index.feedback.person('vk', '7')).total, 0);
    await store.put(
      message(1, 1, {
        raw: {
          id: 1,
          reactions: { results: [{ reaction: { emoticon: '🔥' }, count: 1 }] },
        },
      })
    );
    await index.feedback.flush();
    const saved = await store.get(`feedback-authors:${message(1).id}`);
    assert.equal(saved.actors[0].id, '7');
    index.close();
    const restarted = createChatIndex(store);
    await restarted.ready();
    assert.equal((await restarted.feedback.person('telegram', '7')).total, 2);
    restarted.close();
  } finally {
    index.close();
  }
});

test('live author pages resume, persist profiles, coalesce requests and obey anonymous limits', async () => {
  const { store, index } = await fixture([
    message(1),
    message(2, 3, {
      raw: {
        id: 2,
        reactions: {
          canSeeList: false,
          results: [{ reaction: { emoticon: '👍' }, count: 3 }],
        },
      },
    }),
  ]);
  const calls = [];
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const account = {
    messageReactors: async (options) => {
      calls.push(options);
      await wait;
      return {
        ok: true,
        items: [
          {
            peer: options.offset ? '9' : '8',
            name: options.offset ? 'B' : 'A',
            kind: 'user',
            emoji: '🔥',
            date: 1700000000000,
          },
        ],
        next: options.offset ? null : 'next',
      };
    },
  };
  const service = createFeedbackService({
    store,
    index,
    account,
    now: () => 10000,
  });
  try {
    const first = service.collect(message(1).id);
    assert.equal(service.collect(message(1).id), first);
    release();
    assert.equal((await first).status, 'partial');
    await service.collect(message(1).id);
    assert.equal(calls[1].offset, 'next');
    const authors = await service.actors(message(1).id, {
      offset: 1,
      limit: 1,
    });
    assert.equal(authors.complete, true);
    assert.equal(authors.cachedTotal, 3);
    assert.equal(authors.actors.length, 1);
    assert.equal((await index.feedback.person('telegram', '8')).total, 1);
    assert.equal((await store.get('person:telegram:8')).name, 'A');
    assert.equal((await service.collect(message(2).id)).status, 'hidden');
    assert.equal(calls.length, 2, 'anonymous authors never requested');
    await service.saveSettings({ enabled: false, profiles: false });
    await service.step();
    assert.equal(calls.length, 2);
    assert.deepEqual(await service.settings(), {
      enabled: false,
      profiles: false,
    });
  } finally {
    service.close();
    index.close();
  }
});

test('provider refusal preserves observations and an advancing cursor is required', async () => {
  const { store, index } = await fixture([message(1)]);
  const service = createFeedbackService({
    store,
    index,
    account: {
      messageReactors: async () => ({ ok: true, next: 'same', items: [] }),
    },
  });
  try {
    const result = await service.collect(message(1).id, { offset: 'same' });
    assert.equal(result.code, 'stalled-cursor');
    assert.equal(result.complete, false);
    assert.equal(result.cachedTotal, 1);
  } finally {
    service.close();
    index.close();
  }
});

test('failed evidence writes retain their queue and report bounded diagnostics', async () => {
  const saved = new Map();
  const logs = [];
  let fail = true;
  const evidence = createFeedbackEvidence(
    {
      get: async (id) => saved.get(id),
      put: async (row) => {
        if (fail) {
          throw new Error('disk');
        }
        saved.set(row.id, row);
      },
    },
    (event) => logs.push(event)
  );
  try {
    evidence.preserve({
      id: 'msg:telegram:5:1',
      source: 'telegram',
      chat: '5',
      actors: [{ id: '7', kind: 'user', emoji: '🔥' }],
    });
    await assert.rejects(evidence.flush());
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(logs[0].event, 'feedback_evidence_failed');
    fail = false;
    await evidence.flush();
    assert.equal(saved.size, 1);
  } finally {
    evidence.close();
  }
});
