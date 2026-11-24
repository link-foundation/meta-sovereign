import {
  cancelledAdapter,
  personalFixtureOptions,
} from './vk-cancelled-fixture.mjs';
import { createVkGreetJob } from '../../js/src/automation/vk-greet.js';
import { vkGreetSettings } from '../../js/src/automation/vk-greet-settings.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { friendsServer } from './vk-friends-fixture.mjs';

export const greetAdapter = ({
  ids = [9, 11, 13],
  methods = {},
  ...options
} = {}) => {
  const online = new Map(ids.map((id) => [id, 1]));
  const unread = new Map(ids.map((id) => [id, 0]));
  const counts = new Map(ids.map((id) => [id, 100 - id]));
  let owner = 1;
  const adapter = cancelledAdapter({
    ids,
    ...options,
    methods: {
      'friends.get': (params) =>
        params.user_id
          ? { count: counts.get(Number(params.user_id)), items: [] }
          : {
              count: ids.length,
              items: ids
                .slice(
                  Number(params.offset ?? 0),
                  Number(params.offset ?? 0) + Number(params.count)
                )
                .map((id) => ({ id })),
            },
      'users.get': (params) => [
        {
          id: params.user_ids ? Number(params.user_ids) : owner,
          online: online.get(Number(params.user_ids)),
          can_write_private_message: 1,
        },
      ],
      'messages.getConversationsById': (params) => {
        const id = Number(params.peer_ids);
        return {
          count: 1,
          items: [
            {
              peer: { id, type: 'user' },
              can_write: { allowed: adapter.canWrite.get(id) },
              last_message_id: adapter.histories.get(id)[0]?.id ?? 0,
              unread_count: unread.get(id),
              is_marked_unread: false,
            },
          ],
        };
      },
      ...methods,
    },
  });
  for (const id of ids) {
    adapter.relations.set(id, 3);
  }
  const changeAccount = adapter.account;
  return {
    ...adapter,
    online,
    unread,
    counts,
    ids,
    account: (value) => {
      owner = value;
      changeAccount(value);
    },
  };
};
export const greetJob = (store, adapter, options = {}) =>
  createVkGreetJob({
    store,
    ...personalFixtureOptions(adapter, options),
  });
export const withGreetJob = async (
  check,
  { adapter = greetAdapter(), settings = {}, ...options } = {}
) => {
  const store = createMemoryStore();
  await vkGreetSettings.save(store, {
    ...(await vkGreetSettings.settings(store)),
    ...settings,
  });
  const job = greetJob(store, adapter, options);
  try {
    return await check({ store, adapter, job });
  } finally {
    await job.stop();
  }
};
export const runGreet = async (job) => {
  const { plan } = await job.preview();
  return job.run({ planId: plan.planId, confirm: true });
};
export const greetServer = async (options = {}) => {
  const adapter = options.adapter ?? greetAdapter();
  return friendsServer({
    ...options,
    adapter,
    vkGreet: {
      ...personalFixtureOptions(adapter, options.vkGreet),
    },
  });
};
