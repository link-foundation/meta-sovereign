/** An outgoing request is a candidate, not proof of a cancelled friendship. */
import { positiveVkId } from './vk-friends-settings.js';
import { createStoreQueue } from '../storage/serialized.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';

export const cancelledKeys = {
  job: 'provider-job:vk:cancelled',
  state: 'provider-job-state:vk:cancelled',
  plan: 'provider-job-plan:vk:cancelled',
};
export const cancelledFields = {
  everyMinutes: [1, 1440],
  limit: [0, 100],
  waitDays: [1, 365],
};
export const cancelledTextFields = { greeting: 500, question: 500 };
export const cancelledBooleanFields = ['blockUnanswered', 'blockUnwritable'];
export const normalizeVkCancelled = (input) => {
  const booleanKeys = ['enabled', ...cancelledBooleanFields];
  if (
    !booleanKeys.every((key) => typeof input?.[key] === 'boolean') ||
    !Array.isArray(input.priorityIds) ||
    input.priorityIds.length > 100 ||
    !input.priorityIds.every(positiveVkId)
  ) {
    throw new Error(
      'Boolean consent choices and up to 100 positive priority IDs required'
    );
  }
  const result = Object.fromEntries(
    booleanKeys.map((key) => [key, input[key]])
  );
  for (const [key, [min, max]] of Object.entries(cancelledFields)) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
      throw new Error(`${key} must be an integer from ${min} to ${max}`);
    }
    result[key] = input[key];
  }
  for (const [key, maximum] of Object.entries(cancelledTextFields)) {
    if (typeof input[key] !== 'string' || input[key].length > maximum) {
      throw new Error(`${key} must be text of at most ${maximum} characters`);
    }
    result[key] = input[key].trim();
  }
  if (!result.question) {
    throw new Error('A nonempty friendship question is required');
  }
  return { ...result, priorityIds: [...new Set(input.priorityIds)] };
};
export const readVkCancelledSettings = async (store) =>
  normalizeVkCancelled(
    (await store.get(cancelledKeys.job)) ?? {
      enabled: false,
      everyMinutes: 20,
      limit: 20,
      waitDays: 2,
      priorityIds: [],
      greeting: 'Hello!',
      question: 'Would you like to stay in touch?',
      blockUnanswered: false,
      blockUnwritable: false,
    }
  );
export const readVkCancelled = async (store) => {
  const last = await store.get(cancelledKeys.state);
  return {
    ok: true,
    settings: await readVkCancelledSettings(store),
    plan: await store.get(cancelledKeys.plan),
    last: last
      ? { ...last, status: last.status === 'pending' ? 'unknown' : last.status }
      : null,
  };
};
const serialize = createStoreQueue();
export const loadVkCancelled = (store) =>
  serialize(store, () => readVkCancelled(store));
export const saveVkCancelled = (store, input) =>
  serialize(store, async () => {
    await saveAcknowledgedRecord(store, {
      id: cancelledKeys.job,
      ...normalizeVkCancelled(input),
    });
    return readVkCancelled(store);
  });
export const cancelledLedgerId = (account, user, action) =>
  `provider-cancelled:vk:${account}:${user}:${action}`;
export const cancelledMessage = (settings) =>
  [settings.greeting, settings.question].filter(Boolean).join('\n');
