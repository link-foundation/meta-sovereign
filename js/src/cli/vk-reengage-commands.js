import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import { createVkReengageJob } from '../automation/vk-reengage.js';
import {
  reengageKinds,
  vkReengageSettings,
} from '../automation/vk-reengage-settings.js';
export const createVkReengageCommands = (options) =>
  Object.assign(
    {},
    ...reengageKinds.map((kind) => {
      const policy = vkReengageSettings[kind];
      return createVkFriendPolicyCommands({
        name: `vk-${kind}`,
        createJob: (jobOptions) => createVkReengageJob({ ...jobOptions, kind }),
        load: policy.load,
        save: policy.save,
        flags: {
          'every-minutes': 'everyMinutes',
          limit: 'limit',
          'scan-limit': 'scanLimit',
          'stale-days': 'staleDays',
          'cooldown-days': 'cooldownDays',
          'sticker-id': 'stickerId',
        },
        stringFlags: {
          greeting: 'greeting',
          questions: 'questions',
          ...(kind === 'music' ? { audio: 'audio' } : {}),
        },
        booleanFlags: { 'online-only': 'onlineOnly' },
        ...options,
      });
    })
  );
