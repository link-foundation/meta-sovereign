import { createVkPersonalSettings } from './vk-personal-settings.js';

export const reengageKinds = ['topic', 'help', 'music'];
export const reengageFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  scanLimit: [1, 10000],
  staleDays: [1, 3650],
  cooldownDays: [1, 3650],
  stickerId: [0, 2147483647],
};
export const reengageTextFields = { greeting: 500, questions: 10000 };
export const reengageBooleans = ['onlineOnly'];
export const questionVariants = (text) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
// Owner-configured native identity only. No access keys or arbitrary URLs.
export const vkAudioIdentity = (value) =>
  /^audio-?[1-9]\d{0,14}_[1-9]\d{0,14}$/u.test(value);
const defaults = {
  topic: ['What do you think about the topic we discussed?', 7],
  help: ['How can I help you?', 31],
  music: ['What do you think of this music?', 31],
};
const validate = (settings) => {
  const variants = questionVariants(settings.questions);
  if (!settings.greeting && !settings.stickerId) {
    throw new Error('A greeting or sticker is required');
  }
  if (
    !variants.length ||
    variants.length > 20 ||
    variants.some((s) => s.length > 500)
  ) {
    throw new Error(
      'Provide 1–20 question variants, one per line, at most 500 characters each'
    );
  }
  if (
    settings.audio !== undefined &&
    settings.audio &&
    !vkAudioIdentity(settings.audio)
  ) {
    throw new Error('A native audioOWNER_ID_AUDIO_ID identity is required');
  }
  if (settings.enabled && settings.audio === '') {
    throw new Error('Choose an audio attachment before enabling music');
  }
};
export const vkReengageSettings = Object.fromEntries(
  reengageKinds.map((kind) => [
    kind,
    createVkPersonalSettings(kind, {
      fields: reengageFields,
      textFields: {
        ...reengageTextFields,
        ...(kind === 'music' ? { audio: 64 } : {}),
      },
      booleans: reengageBooleans,
      defaults: {
        enabled: false,
        everyMinutes: 20,
        limit: 10,
        scanLimit: 100,
        staleDays: defaults[kind][1],
        cooldownDays: 1,
        stickerId: 0,
        greeting: 'Hello!',
        questions: defaults[kind][0],
        ...(kind === 'music' ? { audio: '' } : {}),
        onlineOnly: true,
        priorityIds: [],
      },
      validate,
    }),
  ])
);
export const reengageLedgerId = (kind, account, user) =>
  `provider-reengage:vk:${kind}:${account}:${user}`;
