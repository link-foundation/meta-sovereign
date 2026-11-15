/** Shared serialized, acknowledged VK relationship effects and paced batches. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { safeMessage } from '../server/redact.js';
import { friendLedgerId, uncertainFriendAction } from './vk-friends-records.js';
export const performVkFriendAction = async (
  context,
  plan,
  item,
  original,
  { issue, beforeIssue, intentDetails = {} }
) => {
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
    ...intentDetails,
  };
  let issued = false;
  let result;
  try {
    const receipt = await issue(async () => {
      // Persist only after the provider's rate wait, then recheck consent and
      // fresh provider state after the durable intent acknowledgement.
      await saveAcknowledgedRecord(store, intent);
      await beforeIssue();
      issued = true;
    });
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

export const runVkFriendBatch = async (
  context,
  plan,
  { stateKey, pace, event, perform, read }
) => {
  const { store, now, sleep, signal, isStopped, log } = context;
  const results = [];
  const pending = {
    id: stateKey,
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
        await sleep(pace, signal);
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
    const result = await perform(item, results.length);
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
  log({ event, status, attempted: results.length });
  return read(store);
};
