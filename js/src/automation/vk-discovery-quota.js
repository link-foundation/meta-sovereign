import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { refuseFriendAction } from './vk-friends-records.js';
export const discoveryDate = (now) => new Date(now).toISOString().slice(0, 10);
export const discoveryQuotaId = (account, date) =>
  `provider-discovery-quota:vk:${account}:${date}`;
const pauseId = (account) => `provider-discovery-pause:vk:${account}`;
export const readDiscoveryQuota = async (store, account, date) =>
  (await store.get(discoveryQuotaId(account, date))) ?? {
    id: discoveryQuotaId(account, date),
    reservations: [],
  };
export const discoveryPaused = async (store, account, now) =>
  ((await store.get(pauseId(account)))?.until ?? 0) > now;
export const reserveDiscoveryRequest = async (context, plan, item) => {
  if (plan.kind === 'rejections') {
    return;
  }
  const quota = await readDiscoveryQuota(
    context.store,
    plan.accountId,
    plan.date
  );
  const reservation = `${plan.planId}:${item.userId}`;
  if (
    quota.reservations.includes(reservation) ||
    quota.reservations.length >= 40 ||
    discoveryDate(context.now()) !== plan.date
  ) {
    refuseFriendAction('VK daily discovery allowance changed; review again');
  }
  await saveAcknowledgedRecord(context.store, {
    ...quota,
    reservations: [...quota.reservations, reservation],
  });
};
export const pauseDiscoveryError = async (context, plan, error) => {
  const hours = { 8: 24, 14: 1, 29: 1 }[error.vkCode];
  if (!hours) {
    return;
  }
  const id = pauseId(plan.accountId);
  const previous = await context.store.get(id);
  await saveAcknowledgedRecord(context.store, {
    id,
    code: error.vkCode,
    until: Math.max(previous?.until ?? 0, context.now() + hours * 3600000),
  });
};
