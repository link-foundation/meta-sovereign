import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createFakeVk, message } from '../../js/tests/helpers/fake-vk.js';
import { createVkRetentionJob } from '../../js/src/automation/vk-retention.js';
import { retentionPolicy } from '../../js/src/automation/vk-retention-settings.js';
import { buildMessageLink } from '../../js/src/sources/link.js';
import { friendsServer } from './vk-friends-fixture.mjs';
export const retentionAdapter = (options = {}) => {
  let owner = 1;
  const histories = new Map([
    [
      9,
      Array.from({ length: options.count ?? 3 }, (_, i) =>
        message(i + 1, 9, `History ${i + 1}`)
      ).reverse(),
    ],
  ]);
  const effects = [];
  const remove = (method, params) => {
    const peer = Number(params.peer_id);
    const rows = histories.get(peer) ?? [];
    const ids =
      method === 'conversation'
        ? rows.map((m) => m.conversation_message_id)
        : params.cmids.split(',').map(Number);
    effects.push({ method, peer, ids });
    const mode =
      options.response?.(method, effects.length) ??
      (method === 'conversation' && options.fallback
        ? 'unsupported'
        : 'confirmed');
    if (mode === 'unsupported' || mode === 'refused') {
      return {
        error: {
          error_code: mode === 'unsupported' ? 3 : 29,
          error_msg: 'Synthetic retention refusal',
        },
      };
    }
    if (mode === 'unknown') {
      throw new Error('Synthetic retention reply lost');
    }
    if (mode === 'invalid') {
      return {};
    }
    const deleted = mode === 'mixed' ? ids.slice(1) : ids;
    if (mode !== 'ackOnly') {
      histories.set(
        peer,
        rows.filter((m) => !deleted.includes(m.conversation_message_id))
      );
    }
    if (method === 'conversation') {
      return { last_deleted_id: Math.max(0, ...rows.map((m) => m.id)) };
    }
    return ids.map((id) => ({
      peer_id: peer,
      conversation_message_id: id,
      message_id: id,
      response: deleted.includes(id) ? 1 : 0,
    }));
  };
  const fake = createFakeVk({
    methods: {
      'users.get': () => [{ id: owner }],
      'messages.getHistory': (params) => {
        const rows = histories.get(Number(params.peer_id)) ?? [];
        return {
          count: rows.length,
          items: rows.slice(
            Number(params.offset),
            Number(params.offset) + Number(params.count)
          ),
        };
      },
      'messages.deleteConversation': (p) => remove('conversation', p),
      'messages.delete': (p) => remove('messages', p),
      ...options.methods,
    },
  });
  return {
    fake,
    live: createVkLive({
      ...fake,
      limiter: { wait: async () => {} },
      ...options.live,
    }),
    histories,
    effects,
    account: (id) => {
      owner = id;
    },
  };
};
export const retentionOptions = (adapter, options = {}) => ({
  resolve: () => ({ live: adapter.live }),
  optionsFor: async () => ({ token: 'fixture-user-token' }),
  now: () => Date.UTC(2026, 10, 15, 12),
  sleep: async () => {},
  ...options,
});
export const retentionJob = (store, adapter, options = {}) =>
  createVkRetentionJob({ store, ...retentionOptions(adapter, options) });
export const seedRetention = async (store, adapter, settings = {}) => {
  await retentionPolicy.save(store, {
    ...(await retentionPolicy.settings(store)),
    peers: '9',
    threshold: 1,
    scanLimit: 200,
    ...settings,
  });
  for (const row of adapter.histories.get(9)) {
    await store.put(
      buildMessageLink({
        source: 'vk',
        externalId: String(row.id),
        sender: '9',
        chat: '9',
        body: row.text,
        timestamp: new Date(row.date * 1000).toISOString(),
      })
    );
  }
  await store.flush?.();
};
export const withRetention = async (
  check,
  {
    store = createMemoryStore(),
    adapter = retentionAdapter(),
    settings = {},
    options = {},
  } = {}
) => {
  await seedRetention(store, adapter, settings);
  const job = retentionJob(store, adapter, options);
  try {
    return await check({ store, adapter, job });
  } finally {
    await job.stop();
  }
};
export const runRetention = async (job) => {
  const { plan } = await job.preview();
  return job.run({ planId: plan.planId, confirm: true });
};
export const retentionServer = async (options = {}) => {
  const adapter = options.adapter ?? retentionAdapter();
  const fixture = await friendsServer({
    ...options,
    adapter,
    vkRetention: retentionOptions(adapter, options.vkRetention),
  });
  await seedRetention(fixture.store, adapter);
  return fixture;
};
