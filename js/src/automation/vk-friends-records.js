import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { safeMessage } from '../server/redact.js';

export const friendObservationIds = (last) => [
  ...new Set([
    ...(last?.observeIds ?? []),
    ...(last?.results ?? [])
      .filter((row) => row.status === 'confirmed')
      .map((row) => row.userId),
  ]),
];
export const readFriendState = async (read, token) => {
  try {
    return await read();
  } catch (cause) {
    throw new Error(safeMessage(cause).split(token).join('<redacted>'), {
      cause,
    });
  }
};

export const equalFriendPolicy = (a, b) =>
  JSON.stringify(a) === JSON.stringify(b);
export const refuseFriendAction = (message) => {
  throw Object.assign(new Error(message), { code: 'review-required' });
};
export const friendLedgerId = (account, target) =>
  `provider-friend:vk:${account}:${target}`;
export const uncertainFriendAction = (row) =>
  ['pending', 'unknown'].includes(row?.status);
export const friendCredentialIdentity = async (token) =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(token)
      )
    ),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');

export const observeFriendReceipt = async (
  store,
  accountId,
  userId,
  relation
) => {
  const previous = await store.get(friendLedgerId(accountId, userId));
  if (
    previous?.status === 'confirmed' &&
    !previous.settled &&
    (previous.expectedRelation === 0
      ? relation === 0
      : [1, 3].includes(relation))
  ) {
    const settled = { ...previous, settled: true };
    await saveAcknowledgedRecord(store, settled);
    return settled;
  }
  return previous;
};
export const friendPlanReason = ({
  userId,
  accountId,
  previous,
  relation,
  priority,
  slots,
}) => {
  if (userId === accountId) {
    return 'owner';
  }
  if (uncertainFriendAction(previous)) {
    return 'unknown';
  }
  if ([1, 3].includes(relation)) {
    return 'existing';
  }
  if (previous?.status === 'confirmed' && !previous.settled) {
    return 'unsettled';
  }
  if (!priority && relation !== 2) {
    return 'changed';
  }
  return slots <= 0 ? 'capacity' : 'eligible';
};
