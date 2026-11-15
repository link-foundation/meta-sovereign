import { createVkSendQueueApi } from './vk-send-queue-api.js';
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
import { createVkCacheApi } from './vk-cache-api.js';
import { createVkStickerApi } from './vk-sticker-api.js';

/** Shared transport and local settings for every VK Connections policy. */
export const createVkProviderApi = (options) =>
  Object.assign(
    {},
    ...[
      createVkAttachmentsApi,
      createVkSendQueueApi,
      createVkOnlineApi,
      createVkFriendsApi,
      createVkMaintenanceApi,
      createVkGreetApi,
      createVkWallApi,
      createVkBirthdayApi,
      createVkRetentionApi,
      createVkDiscoveryApi,
      createVkCacheApi,
      createVkStickerApi,
      createVkReengageApi,
      createVkCancelledApi,
    ].map((create) => create(options))
  );
