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
export const wallBooleans = [
  'replaceOwned',
  'activeAvatar',
  'randomAttachment',
  'holdAnyVisible',
];
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
// Original opt-in invitation variants; each retains the reviewable marker.
export const wallMessages = [
  'Add me as a friend if you would like to talk.',
  'Add me as a friend to share ideas and interests.',
  'Add me as a friend if you enjoy meeting new people.',
  'Add me as a friend for a friendly conversation.',
  'Add me as a friend if we have something in common.',
  'Add me as a friend to keep in touch.',
  'Add me as a friend if you would like to exchange recommendations.',
  'Add me as a friend to connect beyond this community.',
  'Add me as a friend if you would like to get acquainted.',
  'Add me as a friend and say hello when it suits you.',
];
const messageDefaults = {
  messages: wallMessages.join('\n'),
  marker: 'Add me as a friend',
  restrictedMessage: wallMessages[0],
};
export const wallPolicy = createVkPersonalSettings('wall', {
  fields: wallFields,
  textFields: wallTextFields,
  booleans: wallBooleans,
  messageDefaults,
  upgrade: (input) => ({
    randomAttachment: false,
    holdAnyVisible: false,
    ...input,
  }),
  defaults: {
    enabled: false,
    everyMinutes: 60,
    limit: 10,
    cooldownDays: 1,
    communities: '',
    ...messageDefaults,
    attachments: '',
    restrictedCommunities: '',
    replaceOwned: false,
    activeAvatar: false,
    randomAttachment: false,
    holdAnyVisible: false,
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
