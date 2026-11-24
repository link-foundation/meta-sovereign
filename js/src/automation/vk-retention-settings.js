import { createVkPersonalSettings } from './vk-personal-settings.js';
export const retentionFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  threshold: [0, 10000],
  scanLimit: [1, 10000],
};
export const retentionTextFields = { peers: 2000 };
export const retentionPeerIds = (text) => {
  if (!text.trim()) {
    return [];
  }
  const parts = text.split(',').map((s) => s.trim());
  const ids = parts.map(Number);
  if (
    ids.length > 100 ||
    !parts.every((s) => /^-?[1-9]\d*$/u.test(s)) ||
    !ids.every((id) => Number.isSafeInteger(id) && Math.abs(id) <= 2147483647)
  ) {
    throw new Error(
      'Up to 100 nonzero VK peer IDs, separated by commas, required'
    );
  }
  return [...new Set(ids)];
};
export const retentionPolicy = createVkPersonalSettings('retention', {
  fields: retentionFields,
  textFields: retentionTextFields,
  booleans: [],
  listFields: { peers: ',' },
  defaults: {
    enabled: false,
    everyMinutes: 60,
    limit: 1,
    threshold: 1000,
    scanLimit: 2000,
    peers: '',
    priorityIds: [],
  },
  validate(settings) {
    const ids = retentionPeerIds(settings.peers);
    if (settings.scanLimit <= settings.threshold) {
      throw new Error('History scan limit must exceed the retention threshold');
    }
    if (settings.enabled && !ids.length) {
      throw new Error('Configure peer IDs before enabling history retention');
    }
  },
});
export const retentionLedgerId = (account, peer) =>
  `provider-retention:vk:${account}:${peer}`;
