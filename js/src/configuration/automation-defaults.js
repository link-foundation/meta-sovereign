import {
  readVkOnlineSettings,
  normalizeVkOnlineSettings,
} from '../automation/vk-online-settings.js';
import { readVkFriendSettings } from '../automation/vk-friends-settings.js';
import { readVkMaintenanceSettings } from '../automation/vk-maintenance-settings.js';
import { wallPolicy } from '../automation/vk-wall-settings.js';
import { vkBirthdaySettings } from '../automation/vk-birthday-settings.js';

const policies = {
  online: async (store) =>
    normalizeVkOnlineSettings(
      (await store.get('provider-job:vk:online')) ??
        (await readVkOnlineSettings(store))
    ),
  friends: readVkFriendSettings,
  cleanup: (store) => readVkMaintenanceSettings(store, 'cleanup'),
  outgoing: (store) => readVkMaintenanceSettings(store, 'outgoing'),
  wall: wallPolicy.settings,
  birthday: vkBirthdaySettings.settings,
};
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
export const invalidAutomationConfiguration = () =>
  Object.assign(new Error('Invalid automation defaults.'), {
    code: 'INVALID_APP_CONFIGURATION',
  });

/** Reuse native validators and legacy list readers; never include credentials. */
export const validateAutomationDefaults = async (value = {}) => {
  try {
    if (
      !record(value) ||
      Object.keys(value).some((key) => key !== 'vk') ||
      (value.vk !== undefined && !record(value.vk))
    ) {
      throw invalidAutomationConfiguration();
    }
    const vk = {};
    for (const [name, input] of Object.entries(value.vk ?? {})) {
      if (!Object.hasOwn(policies, name) || !record(input)) {
        throw invalidAutomationConfiguration();
      }
      const read = policies[name];
      const base = await read({ get: async () => undefined });
      const fields = new Set([
        ...Object.keys(base),
        ...(name === 'friends' ? ['acceptancePolicy'] : []),
      ]);
      if (Object.keys(input).some((key) => !fields.has(key))) {
        throw invalidAutomationConfiguration();
      }
      vk[name] = await read({ get: async () => ({ ...base, ...input }) });
    }
    return Object.keys(vk).length ? { vk } : {};
  } catch {
    // Native validation errors may contain private message text or paths.
    throw invalidAutomationConfiguration();
  }
};

/** Deep overlay at policy fields; lists replace rather than concatenate. */
export const mergeAutomationDefaults = (previous = {}, next = {}) => {
  if (!record(next) || (next.vk !== undefined && !record(next.vk))) {
    throw invalidAutomationConfiguration();
  }
  const value = { ...previous, ...next };
  if (next.vk !== undefined) {
    value.vk = { ...previous.vk, ...next.vk };
    for (const [name, settings] of Object.entries(next.vk)) {
      if (!record(settings)) {
        throw invalidAutomationConfiguration();
      }
      value.vk[name] = { ...previous.vk?.[name], ...settings };
    }
  }
  return value;
};
