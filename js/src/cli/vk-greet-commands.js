import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import { createVkGreetJob } from '../automation/vk-greet.js';
import { vkGreetSettings } from '../automation/vk-greet-settings.js';
export const createVkGreetCommands = (options) =>
  createVkFriendPolicyCommands({
    name: 'vk-greet',
    createJob: createVkGreetJob,
    load: vkGreetSettings.load,
    save: vkGreetSettings.save,
    flags: {
      'every-minutes': 'everyMinutes',
      limit: 'limit',
      'scan-limit': 'scanLimit',
      'stale-days': 'staleDays',
      'cooldown-days': 'cooldownDays',
      'sticker-id': 'stickerId',
    },
    stringFlags: { message: 'message' },
    booleanFlags: {
      'online-only': 'onlineOnly',
      'empty-only': 'emptyOnly',
      'order-by-friends': 'orderByFriends',
    },
    ...options,
  });
