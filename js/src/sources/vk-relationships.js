import { createVkFriends } from './vk-friends.js';
import { createVkMaintenance } from './vk-maintenance.js';
import { createVkCancelled } from './vk-cancelled.js';
import { createVkGreet } from './vk-greet.js';
import { createVkReengage } from './vk-reengage.js';
export const createVkRelationships = (requests) => {
  const maintenance = createVkMaintenance(requests);
  const conversations = createVkCancelled({ ...requests, maintenance });
  const greetings = createVkGreet({ ...requests, maintenance, conversations });
  return {
    ...createVkFriends(requests),
    ...maintenance,
    ...conversations,
    ...greetings,
    ...createVkReengage({ ...requests, greetings }),
  };
};
