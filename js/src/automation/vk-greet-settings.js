import { createVkPersonalSettings } from './vk-personal-settings.js';
export const greetFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  scanLimit: [1, 10000],
  staleDays: [0, 3650],
  cooldownDays: [1, 3650],
  stickerId: [0, 2147483647],
};
export const greetTextFields = { message: 500 };
export const greetBooleanFields = ['onlineOnly', 'emptyOnly', 'orderByFriends'];
export const vkGreetSettings = createVkPersonalSettings('greet', {
  fields: greetFields,
  textFields: greetTextFields,
  booleans: greetBooleanFields,
  defaults: {
    enabled: false,
    everyMinutes: 20,
    limit: 10,
    scanLimit: 100,
    staleDays: 30,
    cooldownDays: 1,
    stickerId: 0,
    message: 'Hello!',
    onlineOnly: true,
    emptyOnly: false,
    orderByFriends: false,
    priorityIds: [],
  },
  validate: (settings) => {
    if (!settings.message && !settings.stickerId) {
      throw new Error('A greeting message or sticker is required');
    }
  },
});
export const greetLedgerId = (account, user) =>
  `provider-greet:vk:${account}:${user}`;
