import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import { createVkRetentionJob } from '../automation/vk-retention.js';
import { retentionPolicy } from '../automation/vk-retention-settings.js';
export const createVkRetentionCommands = (options) =>
  createVkFriendPolicyCommands({
    name: 'vk-retention',
    createJob: createVkRetentionJob,
    load: retentionPolicy.load,
    save: retentionPolicy.save,
    flags: {
      'every-minutes': 'everyMinutes',
      limit: 'limit',
      threshold: 'threshold',
      'scan-limit': 'scanLimit',
    },
    stringFlags: { peers: 'peers' },
    ...options,
  });
