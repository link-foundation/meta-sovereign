/** Independent destructive policies; neither runs until explicitly enabled. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';
import { positiveVkId, readVkFriendSettings } from './vk-friends-settings.js';
import { readVkCancelledSettings } from './vk-cancelled-settings.js';
import { vkGreetSettings } from './vk-greet-settings.js';
import { vkReengageSettings } from './vk-reengage-settings.js';
import { vkBirthdaySettings } from './vk-birthday-settings.js';
import { discoveryPolicies } from './vk-discovery-settings.js';

export const maintenanceKinds = ['cleanup', 'outgoing'];
export const maintenanceKeys = (kind) => {
  if (!maintenanceKinds.includes(kind)) {
    throw new Error('VK cleanup or outgoing policy required');
  }
  return {
    job: `provider-job:vk:${kind}`,
    state: `provider-job-state:vk:${kind}`,
    plan: `provider-job-plan:vk:${kind}`,
  };
};
export const normalizeVkMaintenance = (input) => {
  if (
    typeof input?.enabled !== 'boolean' ||
    !Number.isInteger(input.everyMinutes) ||
    input.everyMinutes < 1 ||
    input.everyMinutes > 1440 ||
    !Number.isInteger(input.limit) ||
    input.limit < 0 ||
    input.limit > 10000 ||
    !Array.isArray(input.priorityIds) ||
    input.priorityIds.length > 100 ||
    !input.priorityIds.every(positiveVkId)
  ) {
    throw new Error(
      'enabled, interval 1–1440, limit 0–10000 and up to 100 positive priority IDs required'
    );
  }
  return {
    enabled: input.enabled,
    everyMinutes: input.everyMinutes,
    limit: input.limit,
    priorityIds: [...new Set(input.priorityIds)],
  };
};
export const readVkMaintenanceSettings = async (store, kind) =>
  normalizeVkMaintenance(
    (await store.get(maintenanceKeys(kind).job)) ?? {
      enabled: false,
      everyMinutes: kind === 'cleanup' ? 30 : 8,
      limit: kind === 'cleanup' ? 10000 : 20,
      priorityIds: [],
    }
  );
export const protectedVkFriends = async (store, settings) => {
  const policies = await Promise.all(
    maintenanceKinds.map((kind) => readVkMaintenanceSettings(store, kind))
  );
  return [
    ...new Set([
      ...settings.priorityIds,
      ...(await readVkFriendSettings(store)).priorityIds,
      ...(await readVkCancelledSettings(store)).priorityIds,
      ...(await vkGreetSettings.settings(store)).priorityIds,
      ...(await vkBirthdaySettings.settings(store)).priorityIds,
      ...(
        await Promise.all(
          Object.values(vkReengageSettings).map((policy) =>
            policy.settings(store)
          )
        )
      ).flatMap((policy) => policy.priorityIds),
      ...policies.flatMap((policy) => policy.priorityIds),
      ...(
        await Promise.all(
          Object.values(discoveryPolicies).map((policy) =>
            policy.settings(store)
          )
        )
      ).flatMap((policy) => policy.priorityIds),
    ]),
  ];
};
export const readVkMaintenance = async (store, kind) => {
  const keys = maintenanceKeys(kind);
  const last = await store.get(keys.state);
  return {
    ok: true,
    settings: await readVkMaintenanceSettings(store, kind),
    plan: await store.get(keys.plan),
    last: last
      ? { ...last, status: last.status === 'pending' ? 'unknown' : last.status }
      : null,
  };
};
const serialize = createStoreQueue();
export const loadVkMaintenance = (store, kind) =>
  serialize(store, () => readVkMaintenance(store, kind));
export const saveVkMaintenance = (store, kind, settings) =>
  serialize(store, async () => {
    await saveAcknowledgedRecord(store, {
      id: maintenanceKeys(kind).job,
      ...normalizeVkMaintenance(settings),
    });
    return readVkMaintenance(store, kind);
  });
