/** An outgoing request is a candidate, not proof of a cancelled friendship. */
import { createVkPersonalSettings } from './vk-personal-settings.js';

export const cancelledFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  waitDays: [1, 365],
};
export const cancelledTextFields = { greeting: 500, question: 500 };
export const cancelledBooleanFields = ['blockUnanswered', 'blockUnwritable'];
const policy = createVkPersonalSettings('cancelled', {
  fields: cancelledFields,
  textFields: cancelledTextFields,
  booleans: cancelledBooleanFields,
  defaults: {
    enabled: false,
    everyMinutes: 20,
    limit: 20,
    waitDays: 2,
    priorityIds: [],
    greeting: 'Hello!',
    question: 'Would you like to stay in touch?',
    blockUnanswered: false,
    blockUnwritable: false,
  },
  validate: (settings) => {
    if (!settings.question) {
      throw new Error('A nonempty friendship question is required');
    }
  },
});
export const {
  keys: cancelledKeys,
  normalize: normalizeVkCancelled,
  settings: readVkCancelledSettings,
  read: readVkCancelled,
  load: loadVkCancelled,
  save: saveVkCancelled,
} = policy;
export const cancelledLedgerId = (account, user, action) =>
  `provider-cancelled:vk:${account}:${user}:${action}`;
export const cancelledMessage = (settings) =>
  [settings.greeting, settings.question].filter(Boolean).join('\n');
