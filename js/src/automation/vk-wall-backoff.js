import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { wallLedgerId } from './vk-wall-settings.js';
const backoffId = (account) => `provider-wall-backoff:vk:${account}`;
export const wallPauseReason = async (context, account, community) => {
  const prior = await context.store.get(wallLedgerId(account, community));
  if (context.now() < Date.parse(prior?.pausedUntil ?? '')) {
    return 'communityPaused';
  }
  const backoff = await context.store.get(backoffId(account));
  return context.now() < Date.parse(backoff?.until ?? '')
    ? 'providerBackoff'
    : null;
};
export const retainWallBackoff = async (state, error) => {
  const code = error.vkCode;
  const community = [15, 210, 219].includes(code);
  if (!community && ![10, 14].includes(code)) {
    return;
  }
  await saveAcknowledgedRecord(state.context.store, {
    id: backoffId(state.plan.accountId),
    until: new Date(state.context.now() + 60000).toISOString(),
    code,
  });
  if (community) {
    state.item.pausedUntil = new Date(
      state.context.now() + 86400000
    ).toISOString();
  }
};
