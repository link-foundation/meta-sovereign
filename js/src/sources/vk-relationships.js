import { createVkFriends } from './vk-friends.js';
import { createVkMaintenance } from './vk-maintenance.js';
import { createVkCancelled } from './vk-cancelled.js';
export const createVkRelationships = (requests) => {
  const maintenance = createVkMaintenance(requests);
  return {
    ...createVkFriends(requests),
    ...maintenance,
    ...createVkCancelled({ ...requests, maintenance }),
  };
};
