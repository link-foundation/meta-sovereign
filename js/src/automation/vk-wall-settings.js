import { createVkPersonalSettings } from './vk-personal-settings.js';
import { positiveVkId } from './vk-friends-settings.js';
import { vkNativeAttachments } from '../sources/vk-native-attachment.js';

export const wallFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  cooldownDays: [1, 3650],
};
export const wallTextFields = {
  communities: 2000,
  messages: 10000,
  marker: 500,
  attachments: 2000,
  restrictedCommunities: 2000,
  restrictedMessage: 5000,
};
export const wallBooleans = ['replaceOwned', 'activeAvatar'];
export const wallLines = (value) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
export const wallCommunityIds = (value) => {
  if (!value.trim()) {
    return [];
  }
  const parts = value.split(',').map((s) => s.trim());
  const ids = parts.map(Number);
  if (
    ids.length > 100 ||
    !parts.every((s) => /^[1-9]\d*$/u.test(s)) ||
    !ids.every(positiveVkId)
  ) {
    throw new Error(
      'Up to 100 positive community IDs, separated by commas, required'
    );
  }
  return [...new Set(ids)];
};
export const wallAttachments = (value) =>
  vkNativeAttachments(
    value.trim() ? value.split(',').map((s) => s.trim()) : []
  );
export const wallPolicy = createVkPersonalSettings('wall', {
  fields: wallFields,
  textFields: wallTextFields,
  booleans: wallBooleans,
  defaults: {
    enabled: false,
    everyMinutes: 60,
    limit: 10,
    cooldownDays: 1,
    communities: '',
    messages: 'Add me as a friend if you would like to talk.',
    marker: 'Add me as a friend',
    attachments: '',
    restrictedCommunities: '',
    restrictedMessage: 'Add me as a friend if you would like to talk.',
    replaceOwned: false,
    activeAvatar: false,
    priorityIds: [],
  },
  validate: (settings) => {
    const ids = wallCommunityIds(settings.communities);
    wallCommunityIds(settings.restrictedCommunities);
    wallAttachments(settings.attachments);
    const variants = wallLines(settings.messages);
    if (
      !settings.marker ||
      !variants.length ||
      variants.length > 20 ||
      variants.some((s) => s.length > 5000 || !s.includes(settings.marker)) ||
      !settings.restrictedMessage.includes(settings.marker)
    ) {
      throw new Error(
        'Provide a marker present in every invitation variant and restricted message'
      );
    }
    if (settings.enabled && !ids.length) {
      throw new Error(
        'Configure community destinations before enabling invitations'
      );
    }
  },
});
export const wallLedgerId = (account, community) =>
  `provider-wall:vk:${account}:${community}`;
