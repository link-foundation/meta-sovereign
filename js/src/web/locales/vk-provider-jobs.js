import { vkOnlineLocale } from './vk-online.js';
import { vkFriendsLocale } from './vk-friends.js';
import { vkMaintenanceLocale } from './vk-maintenance.js';
export const vkProviderJobsLocale = (language) => ({
  ...vkOnlineLocale(language),
  ...vkFriendsLocale(language),
  ...vkMaintenanceLocale(language),
});
