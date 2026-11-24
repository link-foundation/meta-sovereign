import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import { createVkBirthdayJob } from '../automation/vk-birthday.js';
import { vkBirthdaySettings } from '../automation/vk-birthday-settings.js';
export const createVkBirthdayCommands = (options) =>
  createVkFriendPolicyCommands({
    name: 'vk-birthday',
    createJob: createVkBirthdayJob,
    load: vkBirthdaySettings.load,
    save: vkBirthdaySettings.save,
    flags: {
      'every-minutes': 'everyMinutes',
      limit: 'limit',
      'scan-limit': 'scanLimit',
    },
    stringFlags: {
      'time-zone': 'timeZone',
      messages: 'messages',
      stickers: 'stickers',
      attachments: 'attachments',
    },
    booleanFlags: { 'online-only': 'onlineOnly' },
    ...options,
  });
