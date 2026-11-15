import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';

export const VK_OUTGOING_SETTINGS = 'setting:vk:outgoing-queue';
export const VK_OUTGOING_PREFIX = 'vk-outgoing:';
const serialize = createStoreQueue();
export const vkOutgoingSettings = (input = {}) => {
  const settings = {
    enabled: false,
    markRead: true,
    typing: true,
    charsPerMinute: 450,
  };
  for (const key of ['enabled', 'markRead', 'typing']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') {
        throw new Error(`${key} must be boolean`);
      }
      settings[key] = input[key];
    }
  }
  if (input.charsPerMinute !== undefined) {
    if (
      !Number.isSafeInteger(input.charsPerMinute) ||
      input.charsPerMinute < 60 ||
      input.charsPerMinute > 3000
    ) {
      throw new Error('charsPerMinute must be an integer from 60 to 3000');
    }
    settings.charsPerMinute = input.charsPerMinute;
  }
  return settings;
};
export const readVkOutgoingSettings = async (store) =>
  vkOutgoingSettings((await store.get(VK_OUTGOING_SETTINGS)) ?? {});
export const saveVkOutgoingSettings = (store, patch) =>
  serialize(store, async () => {
    const settings = vkOutgoingSettings({
      ...(await readVkOutgoingSettings(store)),
      ...patch,
    });
    await saveAcknowledgedRecord(store, {
      id: VK_OUTGOING_SETTINGS,
      tokens: ['setting', 'vk', 'outgoing-queue'],
      ...settings,
    });
    return settings;
  });
