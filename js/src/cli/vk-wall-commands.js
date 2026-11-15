import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import { createVkWallJob } from '../automation/vk-wall.js';
import { wallPolicy } from '../automation/vk-wall-settings.js';
export const createVkWallCommands = (options) =>
  createVkFriendPolicyCommands({
    name: 'vk-wall',
    createJob: createVkWallJob,
    load: wallPolicy.load,
    save: wallPolicy.save,
    flags: {
      'every-minutes': 'everyMinutes',
      limit: 'limit',
      'cooldown-days': 'cooldownDays',
    },
    stringFlags: {
      communities: 'communities',
      messages: 'messages',
      marker: 'marker',
      attachments: 'attachments',
      'restricted-communities': 'restrictedCommunities',
      'restricted-message': 'restrictedMessage',
    },
    booleanFlags: {
      'replace-owned': 'replaceOwned',
      'active-avatar': 'activeAvatar',
      'random-attachment': 'randomAttachment',
    },
    ...options,
  });
