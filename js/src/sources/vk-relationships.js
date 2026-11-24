import { createVkFriends } from './vk-friends.js';
import { createVkMaintenance } from './vk-maintenance.js';
import { createVkCancelled } from './vk-cancelled.js';
import { createVkGreet } from './vk-greet.js';
import { createVkReengage } from './vk-reengage.js';
import { createVkWall } from './vk-wall.js';
import { createVkRetention } from './vk-retention.js';
import { createVkDiscovery } from './vk-discovery.js';
export const createVkRelationships = (requests) => {
  const maintenance = createVkMaintenance(requests);
  const friends = createVkFriends(requests);
  const conversations = createVkCancelled({ ...requests, maintenance });
  const greetings = createVkGreet({ ...requests, maintenance, conversations });
  return {
    ...friends,
    ...createVkDiscovery({ ...requests, friends }),
    ...maintenance,
    ...conversations,
    ...greetings,
    birthdaySnapshot: greetings.greetSnapshot,
    birthdayState: (id, options) =>
      greetings.greetState(id, {
        ...options,
        personalSequence: true,
        birthdaySequence: true,
      }),
    ...createVkReengage({ ...requests, greetings }),
    ...createVkWall(requests),
    ...createVkRetention(requests),
  };
};
