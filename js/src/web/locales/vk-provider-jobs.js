import { vkOnlineLocale } from './vk-online.js';
import { vkFriendsLocale } from './vk-friends.js';
import { vkMaintenanceLocale } from './vk-maintenance.js';
import { vkCancelledLocale } from './vk-cancelled.js';
import { vkGreetLocale } from './vk-greet.js';
import { vkReengageLocale } from './vk-reengage.js';
import { vkWallLocale } from './vk-wall.js';
import { vkBirthdayLocale } from './vk-birthday.js';
import { vkRetentionLocale } from './vk-retention.js';
import { vkDiscoveryLocale } from './vk-discovery.js';
export const vkProviderJobsLocale = (language) => ({
  ...vkOnlineLocale(language),
  ...vkFriendsLocale(language),
  ...vkMaintenanceLocale(language),
  ...vkCancelledLocale(language),
  ...vkGreetLocale(language),
  ...vkReengageLocale(language),
  ...vkWallLocale(language),
  ...vkBirthdayLocale(language),
  ...vkRetentionLocale(language),
  ...vkDiscoveryLocale(language),
});
