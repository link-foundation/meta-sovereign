import { createVkFriendPolicyCommands } from './vk-friends-commands.js';
import {
  createVkCancelledJob,
  loadVkCancelled,
  saveVkCancelled,
} from '../automation/vk-cancelled.js';
export const createVkCancelledCommands = (options) =>
  createVkFriendPolicyCommands({
    name: 'vk-cancelled',
    createJob: createVkCancelledJob,
    load: loadVkCancelled,
    save: saveVkCancelled,
    flags: {
      'every-minutes': 'everyMinutes',
      limit: 'limit',
      'wait-days': 'waitDays',
    },
    stringFlags: { greeting: 'greeting', question: 'question' },
    booleanFlags: {
      'block-unanswered': 'blockUnanswered',
      'block-unwritable': 'blockUnwritable',
    },
    ...options,
  });
