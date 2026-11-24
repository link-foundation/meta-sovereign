import { createMemoryStore } from '../../js/src/storage/universal.js';
import { cancelledAdapter, cancelledJob } from './vk-cancelled-fixture.mjs';
import { greetAdapter, greetJob } from './vk-greet-fixture.mjs';
import { birthdayAdapter, birthdayJob } from './vk-birthday-fixture.mjs';
import { reengageAdapter, reengageJob } from './vk-reengage-fixture.mjs';
import { friendsAdapter, friendsJob } from './vk-friends-fixture.mjs';
import { maintenanceAdapter } from './vk-maintenance-fixture.mjs';
import { createVkMaintenanceJob } from '../../js/src/automation/vk-maintenance.js';
import {
  discoveryAdapter,
  discoveryJob,
  seedDiscovery,
} from './vk-discovery-fixture.mjs';
import {
  retentionAdapter,
  retentionJob,
  seedRetention,
} from './vk-retention-fixture.mjs';

const personal = (name, adapter, job) => ({
  name,
  adapter: (limiter) => adapter({ ids: [9], limiter }),
  job,
});
export const vkPersonPolicies = [
  personal('cancelled', cancelledAdapter, cancelledJob),
  personal('greet', greetAdapter, greetJob),
  personal('birthday', birthdayAdapter, birthdayJob),
  ...['topic', 'help', 'music'].map((name) => ({
    ...personal(name, reengageAdapter, (store, adapter) =>
      reengageJob(name, store, adapter)
    ),
    // The music policy requires an explicit native audio identity.
    seed: async (store) => {
      const { vkReengageSettings } =
        await import('../../js/src/automation/vk-reengage-settings.js');
      const policy = vkReengageSettings[name];
      await policy.save(store, {
        ...(await policy.settings(store)),
        ...(name === 'music' ? { audio: 'audio-1_23' } : {}),
      });
    },
  })),
  {
    name: 'friends',
    adapter: (limiter) => friendsAdapter({ live: { limiter } }),
    job: friendsJob,
  },
  ...['cleanup', 'outgoing'].map((name) => ({
    name,
    adapter: (limiter) => maintenanceAdapter({ live: { limiter } }),
    job: (store, adapter) =>
      createVkMaintenanceJob({
        store,
        kind: name,
        resolve: () => ({ live: adapter.live }),
        optionsFor: async () => ({ token: 'fixture-user-token' }),
        sleep: async () => {},
      }),
  })),
  ...['suggestions', 'community', 'rejections'].map((name) => ({
    name,
    adapter: (limiter) => discoveryAdapter({ live: { limiter } }),
    job: (store, adapter) => discoveryJob(store, adapter, name),
    seed: (store) => seedDiscovery(store, name),
  })),
  {
    name: 'retention',
    adapter: (limiter) => retentionAdapter({ live: { limiter } }),
    job: retentionJob,
    seed: seedRetention,
  },
];

/** Exercise actual VK adapters without credentials, scheduling or live effects. */
export const withVkPersonPolicy = async (policy, check) => {
  const store = createMemoryStore();
  let mutate = async () => {};
  let writing = false;
  const adapter = policy.adapter({
    wait: async () => {
      if (writing) {
        writing = false;
        const pending = mutate;
        mutate = async () => {};
        await pending();
      }
    },
  });
  for (const name of [
    'greetEffect',
    'cancelledEffect',
    'reengageEffect',
    'addFriend',
    'removeFriend',
    'rejectFriendRequest',
    'deleteRetention',
  ]) {
    if (typeof adapter.live[name] !== 'function') {
      continue;
    }
    const effect = adapter.live[name];
    adapter.live[name] = (...args) => {
      writing = true;
      return effect(...args);
    };
  }
  let job;
  try {
    await policy.seed?.(store, adapter);
    job = policy.job(store, adapter);
    return await check({
      store,
      adapter,
      job,
      atIssue: (change) => {
        mutate = change;
      },
    });
  } finally {
    await job?.stop();
    await store.close?.();
  }
};
