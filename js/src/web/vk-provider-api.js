import { createVkAttachmentsApi } from './vk-attachments-api.js';
import { createVkOnlineApi } from './vk-online-api.js';
import { createVkFriendsApi } from './vk-friends-api.js';
import { createVkMaintenanceApi } from './vk-maintenance-api.js';
import { createVkCancelledApi } from './vk-cancelled-api.js';
import { createVkGreetApi } from './vk-greet-api.js';
import { createVkReengageApi } from './vk-reengage-api.js';
import { createVkWallApi } from './vk-wall-api.js';
import { createVkBirthdayApi } from './vk-birthday-api.js';
import { createVkRetentionApi } from './vk-retention-api.js';
import { createVkDiscoveryApi } from './vk-discovery-api.js';

/** Shared transport and local settings for every VK Connections policy. */
export const createVkProviderApi = (options) =>
  Object.assign(
    {},
    ...[
      createVkAttachmentsApi,
      createVkOnlineApi,
      createVkFriendsApi,
      createVkMaintenanceApi,
      createVkGreetApi,
      createVkWallApi,
      createVkBirthdayApi,
      createVkRetentionApi,
      createVkDiscoveryApi,
      createVkReengageApi,
      createVkCancelledApi,
    ].map((create) => create(options))
  );
