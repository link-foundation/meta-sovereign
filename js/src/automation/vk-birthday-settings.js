import { createVkPersonalSettings } from './vk-personal-settings.js';
import { questionVariants } from './vk-reengage-settings.js';
import { vkNativeAttachments } from '../sources/vk-native-attachment.js';

export const birthdayFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  scanLimit: [1, 10000],
};
export const birthdayTextFields = {
  timeZone: 100,
  messages: 10000,
  stickers: 250,
  attachments: 1600,
};
export const birthdayStickers = (text) => {
  const ids = text.trim() ? text.split(',').map((value) => value.trim()) : [];
  if (
    ids.length > 20 ||
    ids.some((id) => !/^[1-9]\d{0,9}$/u.test(id) || Number(id) > 2147483647)
  ) {
    throw new Error('Up to twenty positive VK sticker IDs required');
  }
  return [...new Set(ids.map(Number))];
};
export const birthdayAttachments = (text) =>
  vkNativeAttachments(
    text.trim() ? text.split(',').map((id) => id.trim()) : []
  );
export const birthdayDate = (now, timeZone) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const value = (type) => parts.find((p) => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
// Original short defaults; no upstream personal promises or media are imported.
export const birthdayMessages = [
  'Happy birthday! 🎂',
  'Wishing you a joyful birthday! 🎉',
  'Have a lovely birthday! 🌻',
  'Happy birthday and best wishes! 🎈',
  'Enjoy your special day! 🎁',
  'Wishing you a wonderful year ahead! ✨',
  'Happy birthday! Hope today brings a smile. ☀️',
  'Warm birthday wishes to you! 🌟',
  'Have a happy birthday! 🌸',
  'Wishing you a bright and happy birthday! 🍀',
];
export const vkBirthdaySettings = createVkPersonalSettings('birthday', {
  fields: birthdayFields,
  textFields: birthdayTextFields,
  booleans: ['onlineOnly'],
  messageDefaults: { messages: birthdayMessages.join('\n') },
  defaults: {
    enabled: false,
    everyMinutes: 60,
    limit: 10,
    scanLimit: 100,
    timeZone: 'UTC',
    messages: birthdayMessages.join('\n'),
    stickers: '',
    attachments: '',
    onlineOnly: false,
    priorityIds: [],
  },
  validate: (settings) => {
    birthdayDate(Date.now(), settings.timeZone);
    if (!settings.timeZone) {
      throw new Error('An explicit IANA time zone is required');
    }
    const texts = questionVariants(settings.messages);
    const stickers = birthdayStickers(settings.stickers);
    const attachments = birthdayAttachments(settings.attachments);
    if (texts.length > 20 || texts.some((text) => text.length > 500)) {
      throw new Error(
        'Up to twenty birthday messages, 500 characters each, one per line'
      );
    }
    if (!texts.length && !stickers.length && !attachments.length) {
      throw new Error(
        'A birthday message, sticker or native attachment is required'
      );
    }
  },
});
