import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { safeMessage } from '../server/redact.js';
import {
  VK_FRIENDS_STATE as STATE,
  readVkFriendSettings,
  readVkFriends,
} from './vk-friends-settings.js';
import {
  equalFriendPolicy as equal,
  refuseFriendAction as refuse,
  friendLedgerId,
  uncertainFriendAction,
  friendCredentialIdentity,
} from './vk-friends-records.js';

const currentPolicy = async (
  { store, isStopped, optionsFor },
  plan,
  original
) => {
  if (isStopped() || !equal(plan.settings, await readVkFriendSettings(store))) {
    refuse('Service stopped or friend policy changed; review again');
  }
  if ((await optionsFor())?.token !== original.options.token) {
    refuse('VK account credential changed; review again');
  }
};
const guard = async (context, plan, item, original, reserved) => {
  await currentPolicy(context, plan, original);
  const state = await original.live.friendState(item.userId, original.options);
  if (
    state.accountId !== plan.accountId ||
    state.statuses[item.userId] !== item.relation
  ) {
    refuse('VK account or friend relation changed; review again');
  }
  if (
    Math.max(state.count, plan.friendCount + reserved) >=
    plan.settings.maxFriends
  ) {
    refuse('Friend capacity reached');
  }
};
const performFriendAction = async (context, plan, item, original, reserved) => {
  const { store, now } = context;
  const id = friendLedgerId(plan.accountId, item.userId);
  const previous = await store.get(id);
  if (
    uncertainFriendAction(previous) ||
    (previous?.status === 'confirmed' && !previous.settled)
  ) {
    return { userId: item.userId, status: 'unknown' };
  }
  const intent = {
    id,
    accountId: plan.accountId,
    userId: item.userId,
    planId: plan.planId,
    attemptedAt: new Date(now()).toISOString(),
    status: 'pending',
  };
  let issued = false;
  let result;
  try {
    const receipt = await original.live.addFriend(
      item.userId,
      original.options,
      async () => {
        // The adapter's rate wait is over. Persist intent, then recheck fresh
        // provider state and current consent immediately before issue.
        await saveAcknowledgedRecord(store, intent);
        await guard(context, plan, item, original, reserved);
        await currentPolicy(context, plan, original);
        issued = true;
      }
    );
    if (!issued || receipt?.confirmed !== true) {
      throw Object.assign(new Error('Missing friend acknowledgement'), {
        code: 'unconfirmed',
      });
    }
    result = { ...intent, ...receipt, status: 'confirmed' };
  } catch (error) {
    result = {
      ...intent,
      status: issued && !error.vkCode ? 'unknown' : 'refused',
      error: safeMessage(error)
        .split(original.options.token)
        .join('<redacted>')
        .slice(0, 300),
    };
  }
  // A refused outcome write retains durable pending intent, never success.
  await saveAcknowledgedRecord(store, result);
  return {
    userId: item.userId,
    status: result.status,
    outcome: result.outcome,
  };
};
export const applyVkFriendPlan = async (context, plan) => {
  const { store, now, provider, sleep, signal, isStopped, log } = context;
  if (
    !equal(plan.settings, await readVkFriendSettings(store)) ||
    now() - plan.createdAt > 300000 ||
    now() < plan.createdAt
  ) {
    refuse('Friend plan changed or expired; review again');
  }
  const original = await provider();
  if (
    plan.credentialIdentity !==
    (await friendCredentialIdentity(original.options.token))
  ) {
    refuse('VK account credential changed; review again');
  }
  const results = [];
  const pending = {
    id: STATE,
    attemptedAt: new Date(now()).toISOString(),
    status: 'pending',
    planId: plan.planId,
    results: [],
  };
  await saveAcknowledgedRecord(store, { ...plan, status: 'consumed' });
  await saveAcknowledgedRecord(store, pending);
  let cancelled = false;
  for (const item of plan.items.filter((row) => row.reason === 'eligible')) {
    if (results.length) {
      try {
        await sleep(10000, signal);
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
    if (isStopped()) {
      cancelled = true;
      break;
    }
    const result = await performFriendAction(
      context,
      plan,
      item,
      original,
      results.length
    );
    results.push(result);
    await saveAcknowledgedRecord(store, { ...pending, results: [...results] });
    if (result.status !== 'confirmed') {
      break;
    }
  }
  const status = results.some((row) => row.status === 'unknown')
    ? 'unknown'
    : cancelled || results.some((row) => row.status === 'refused')
      ? 'refused'
      : 'confirmed';
  await saveAcknowledgedRecord(store, { ...pending, status, results });
  log({ event: 'vk_friend_batch', status, attempted: results.length });
  return readVkFriends(store);
};
