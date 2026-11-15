import { vkOnlineLocale } from './vk-online.js';
import { vkFriendsLocale } from './vk-friends.js';
import { vkMaintenanceLocale } from './vk-maintenance.js';
import { vkCancelledLocale } from './vk-cancelled.js';
import { vkGreetLocale } from './vk-greet.js';
import { vkReengageLocale } from './vk-reengage.js';
export const vkProviderJobsLocale = (language) => ({
  ...vkOnlineLocale(language),
  ...vkFriendsLocale(language),
  ...vkMaintenanceLocale(language),
  ...vkCancelledLocale(language),
  ...vkGreetLocale(language),
  ...vkReengageLocale(language),
});
