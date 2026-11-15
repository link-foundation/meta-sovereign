import { createMemoryStore } from '../../js/src/storage/universal.js';
import { readVkFriendStats } from '../../js/src/automation/vk-friend-stats.js';
import {
  loadVkFriends,
  saveVkFriends,
} from '../../js/src/automation/vk-friends.js';
import { friendsAdapter, friendsJob } from './vk-friends-fixture.mjs';

export const statsTime = Date.parse('2026-10-31T23:59:59.000Z');
export const acceptanceFixture = async ({
  store = createMemoryStore(),
  ...options
} = {}) => {
  const adapter = friendsAdapter();
  let time = statsTime;
  const job = friendsJob(store, adapter, { now: () => time, ...options });
  return {
    store,
    adapter,
    job,
    advance: (value) => {
      time = Date.parse(value);
    },
    summary: async () => (await readVkFriendStats(store, time)).accounts[0],
    run: async () =>
      job.run({ planId: (await job.preview()).plan.planId, confirm: true }),
    async requestAgain() {
      await job.preview(); // Positively settle the acknowledged relationship.
      adapter.relations.set(9, 0);
      await saveVkFriends(store, {
        ...(await loadVkFriends(store)).settings,
        priorityIds: [9],
      });
      return this.run();
    },
    close: () => job.stop(),
  };
};
