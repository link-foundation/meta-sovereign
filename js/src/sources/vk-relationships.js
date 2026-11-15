import { createVkFriends } from './vk-friends.js';
import { createVkMaintenance } from './vk-maintenance.js';
import { createVkCancelled } from './vk-cancelled.js';
import { createVkGreet } from './vk-greet.js';
export const createVkRelationships = (requests) => {
  const maintenance = createVkMaintenance(requests);
  const conversations = createVkCancelled({ ...requests, maintenance });
  return {
    ...createVkFriends(requests),
    ...maintenance,
    ...conversations,
    ...createVkGreet({ ...requests, maintenance, conversations }),
  };
};
