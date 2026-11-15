import { createStoreQueue } from '../storage/serialized.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { positiveVkId, legacyFriendPriority } from './vk-friends-settings.js';

/** Browser-safe acknowledged configuration for an independent personal job. */
export const createVkPersonalSettings = (name, spec) => {
  const keys = Object.fromEntries(
    ['job', 'state', 'plan'].map((kind) => [
      kind,
      `provider-job${kind === 'job' ? '' : `-${kind}`}:vk:${name}`,
    ])
  );
  const normalize = (value) => {
    const input = spec.upgrade ? spec.upgrade(value) : value;
    const result = {};
    for (const key of ['enabled', ...spec.booleans]) {
      if (typeof input?.[key] !== 'boolean') {
        throw new Error(`${key} must be true or false`);
      }
      result[key] = input[key];
    }
    for (const [key, [min, max]] of Object.entries(spec.fields)) {
      if (
        !Number.isInteger(input[key]) ||
        input[key] < min ||
        input[key] > max
      ) {
        throw new Error(`${key} must be an integer from ${min} to ${max}`);
      }
      result[key] = input[key];
    }
    for (const [key, max] of Object.entries(spec.textFields)) {
      if (typeof input[key] !== 'string' || input[key].length > max) {
        throw new Error(`${key} must be text of at most ${max} characters`);
      }
      result[key] = input[key].trim();
    }
    if (
      !Array.isArray(input.priorityIds) ||
      input.priorityIds.length > 100 ||
      !input.priorityIds.every(positiveVkId)
    ) {
      throw new Error('Up to 100 positive priority IDs required');
    }
    result.priorityIds = [...new Set(input.priorityIds)];
    spec.validate(result);
    return result;
  };
  const settings = async (store) => {
    const saved = (await store.get(keys.job)) ?? spec.defaults;
    return normalize({
      ...saved,
      priorityIds: legacyFriendPriority(saved.priorityIds),
    });
  };
  const read = async (store) => {
    const last = await store.get(keys.state);
    return {
      ok: true,
      settings: await settings(store),
      ...(spec.messageDefaults
        ? { messageDefaults: { ...spec.messageDefaults } }
        : {}),
      plan: await store.get(keys.plan),
      last: last
        ? {
            ...last,
            status: last.status === 'pending' ? 'unknown' : last.status,
          }
        : null,
    };
  };
  const serialize = createStoreQueue();
  return {
    keys,
    settings,
    read,
    normalize,
    load: (store) => serialize(store, () => read(store)),
    save: (store, input) =>
      serialize(store, async () => {
        await saveAcknowledgedRecord(store, {
          id: keys.job,
          ...normalize(input),
        });
        return read(store);
      }),
  };
};
