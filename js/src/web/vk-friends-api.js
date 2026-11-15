import {
  loadVkFriends,
  saveVkFriends,
} from '../automation/vk-friends-settings.js';
import { createVkConnectionApi } from './vk-connection-api.js';

export const createVkFriendsApi = (options) => {
  const api = createVkConnectionApi(
    options,
    '/api/vk/friends',
    loadVkFriends,
    saveVkFriends
  );
  return {
    vkFriends: api.load,
    saveVkFriends: api.save,
    seedVkFriendPriority: () => api.action('seed-priority', {}),
    clearVkFriendPriority: () => api.action('clear-priority', {}),
    planVkFriends: () => api.action('plan', {}),
    runVkFriends: (planId) => api.action('run', { planId, confirm: true }),
  };
};
