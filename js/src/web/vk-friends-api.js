import {
  loadVkFriends,
  saveVkFriends,
} from '../automation/vk-friends-settings.js';
import { createVkConnectionApi } from './vk-connection-api.js';
import { readVkFriendStats } from '../automation/vk-friend-stats.js';
import { activeAccount } from './telegram-account-scope.js';
import { VK_FRIEND_STATS_UPDATED } from './vk-friend-stats-feed.js';

export const createVkFriendsApi = (options) => {
  const changed = async (operation) => {
    const answer = await operation();
    if (answer?.ok && globalThis.dispatchEvent) {
      globalThis.dispatchEvent(new globalThis.Event(VK_FRIEND_STATS_UPDATED));
    }
    return answer;
  };
  const api = createVkConnectionApi(
    options,
    '/api/vk/friends',
    loadVkFriends,
    saveVkFriends
  );
  return {
    async vkFriendStats(signal) {
      const answer = await options.get(
        '/api/vk/friends/stats',
        { signal },
        { recover: false }
      );
      if (answer) {
        return answer;
      }
      if (signal?.aborted || activeAccount() !== 1) {
        return { ok: false };
      }
      const store = await options.local();
      if (signal?.aborted || activeAccount() !== 1) {
        return { ok: false };
      }
      return { ...(await readVkFriendStats(store)), cached: true };
    },
    vkFriends: api.load,
    saveVkFriends: api.save,
    seedVkFriendPriority: () => api.action('seed-priority', {}),
    clearVkFriendPriority: () => api.action('clear-priority', {}),
    planVkFriends: () => changed(() => api.action('plan', {})),
    runVkFriends: (planId) =>
      changed(() => api.action('run', { planId, confirm: true })),
  };
};
