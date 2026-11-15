import { vkOnlineLocale } from './vk-online.js';
import { vkFriendsLocale } from './vk-friends.js';
export const vkProviderJobsLocale = (language) => ({
  ...vkOnlineLocale(language),
  ...vkFriendsLocale(language),
});
