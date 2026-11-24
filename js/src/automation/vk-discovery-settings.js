import { createVkPersonalSettings } from './vk-personal-settings.js';
export const discoveryKinds = ['suggestions', 'community', 'rejections'];
const interval = { everyMinutes: [1, 1440], limit: [0, 100] };
export const discoveryFields = {
  suggestions: { ...interval, scanLimit: [1, 100], maxFriends: [0, 10000] },
  community: {
    ...interval,
    limit: [0, 40],
    scanLimit: [1, 1000],
    maxFriends: [0, 10000],
    communityId: [0, 2147483647],
    offset: [0, 500000],
    sex: [0, 2],
  },
  rejections: { ...interval, limit: [0, 1000], scanLimit: [1, 10000] },
};
export const discoveryBooleans = {
  suggestions: [],
  community: ['onlineOnly', 'photoRequired', 'openOnly'],
  rejections: [],
};
const defaults = {
  suggestions: { maxFriends: 9900, scanLimit: 100 },
  community: {
    maxFriends: 9900,
    scanLimit: 1000,
    communityId: 0,
    offset: 0,
    sex: 2,
    onlineOnly: true,
    photoRequired: true,
    openOnly: true,
  },
  rejections: { scanLimit: 1000 },
};
export const discoveryPolicies = Object.fromEntries(
  discoveryKinds.map((kind) => [
    kind,
    createVkPersonalSettings(kind, {
      fields: discoveryFields[kind],
      booleans: discoveryBooleans[kind],
      textFields: {},
      defaults: {
        enabled: false,
        everyMinutes: 60,
        limit: 1,
        priorityIds: [],
        ...defaults[kind],
      },
      validate(settings) {
        if (kind === 'community' && settings.enabled && !settings.communityId) {
          throw new Error(
            'Configure a community before enabling friend discovery'
          );
        }
      },
    }),
  ])
);
