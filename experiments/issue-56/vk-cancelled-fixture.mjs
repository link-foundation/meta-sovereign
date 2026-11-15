import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkCancelledJob } from '../../js/src/automation/vk-cancelled.js';
import {
  readVkCancelledSettings,
  saveVkCancelled,
} from '../../js/src/automation/vk-cancelled-settings.js';
import { friendRelations, friendsServer } from './vk-friends-fixture.mjs';
export const cancelledNow = Date.UTC(2026, 10, 15, 12);
export const cancelledAdapter = ({
  ids = [9, 11],
  methods = {},
  limiter,
} = {}) => {
  let owner = 1;
  let mode = 'confirmed';
  let at = cancelledNow;
  let nextId = 1000;
  const effects = [];
  const relations = new Map(ids.map((id) => [id, 1]));
  const canWrite = new Map(ids.map((id) => [id, true]));
  const histories = new Map(ids.map((id) => [id, []]));
  const addMessage = (
    userId,
    text,
    { out = 1, date = Math.floor(at / 1000), ...rest } = {}
  ) => {
    const row = {
      id: ++nextId,
      peer_id: userId,
      from_id: out ? owner : userId,
      out,
      date,
      text,
      ...rest,
    };
    histories.get(userId).unshift(row);
    return row;
  };
  const effect = (params, action) => {
    const userId = Number(
      action === 'prompt' ? params.peer_id : params.owner_id
    );
    effects.push({
      userId,
      action,
      text: params.message ?? null,
      randomId: params.random_id ?? null,
    });
    if (mode === 'refused') {
      return {
        error: { error_code: 29, error_msg: 'Fixture follow-up refusal' },
      };
    }
    if (mode === 'unknown') {
      throw new Error('Fixture follow-up response lost');
    }
    if (mode === 'unconfirmed') {
      return 0;
    }
    return action === 'prompt' ? addMessage(userId, params.message).id : 1;
  };
  const fake = createFakeVk({
    methods: {
      'users.get': (params) => [
        { id: params.user_ids ? Number(params.user_ids) : owner },
      ],
      'friends.getRequests': (params) => ({
        count: ids.length,
        items: ids.slice(
          Number(params.offset ?? 0),
          Number(params.offset ?? 0) + Number(params.count)
        ),
      }),
      'friends.areFriends': friendRelations(relations),
      'messages.getConversationsById': (params) => {
        const id = Number(params.peer_ids);
        return {
          count: 1,
          items: [
            {
              peer: { id, type: 'user' },
              can_write: { allowed: canWrite.get(id) },
              last_message_id: histories.get(id)[0]?.id ?? 0,
            },
          ],
        };
      },
      'messages.getHistory': (params) => {
        const history = histories.get(Number(params.peer_id));
        return {
          count: history.length,
          items: history.slice(
            Number(params.offset ?? 0),
            Number(params.offset ?? 0) + Number(params.count)
          ),
        };
      },
      'messages.send': (params) => effect(params, 'prompt'),
      'account.ban': (params) => effect(params, 'block'),
      ...methods,
    },
  });
  return {
    fake,
    effects,
    relations,
    canWrite,
    histories,
    addMessage,
    live: createVkLive({
      ...fake,
      limiter: limiter ?? { wait: async () => {} },
    }),
    mode: (value) => {
      mode = value;
    },
    account: (value) => {
      owner = value;
    },
    now: (value) => {
      at = value;
    },
  };
};
export const cancelledJob = (store, adapter, options = {}) =>
  createVkCancelledJob({
    store,
    resolve: () => ({ live: adapter.live }),
    optionsFor: async () => ({ token: 'fixture-user-token' }),
    now: () => cancelledNow,
    sleep: async () => {},
    ...options,
  });
export const withCancelledJob = async (
  check,
  { settings = {}, adapter = cancelledAdapter(), ...options } = {}
) => {
  const store = createMemoryStore();
  await saveVkCancelled(store, {
    ...(await readVkCancelledSettings(store)),
    ...settings,
  });
  const job = cancelledJob(store, adapter, options);
  try {
    return await check({ store, adapter, job });
  } finally {
    await job.stop();
  }
};
export const runCancelledReview = async (job) => {
  const review = await job.preview();
  return job.run({ planId: review.plan.planId, confirm: true });
};
export const cancelledServer = async (options = {}) => {
  const adapter = options.adapter ?? cancelledAdapter();
  return friendsServer({
    ...options,
    adapter,
    vkCancelled: {
      resolve: () => ({ live: adapter.live }),
      optionsFor: async () => ({ token: 'fixture-user-token' }),
      now: () => cancelledNow,
      sleep: async () => {},
      ...options.vkCancelled,
    },
  });
};
