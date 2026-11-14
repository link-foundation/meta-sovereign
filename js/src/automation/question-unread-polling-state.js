import { boundedBrowserText } from './question-browser-state.js';
import { browserUnreadId, unreadFailure } from './question-unread-identity.js';

const integer = (value, fallback, min, max) => {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw unreadFailure(
      'question-unread-polling-settings',
      'Choose bounded unread polling settings.'
    );
  }
  return result;
};

export const normalizeUnreadPolling = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw unreadFailure(
      'question-unread-polling-settings',
      'Choose explicit unread polling settings.'
    );
  }
  const intervalMs = integer(input.intervalMs, 10000, 1000, 7200000);
  return {
    intervalMs,
    durationMs: integer(input.durationMs, 7200000, 1000, 86400000),
    retryMaxMs: integer(
      input.retryMaxMs,
      Math.max(60000, intervalMs),
      intervalMs,
      7200000
    ),
    maxFailures: integer(input.maxFailures, 3, 1, 10),
  };
};

const validPollingIds = (value, parentId) =>
  [value.lastPassId, value.pendingPassId].every(
    (id) => id !== parentId && (id === null || browserUnreadId(id))
  ) &&
  (value.lastPassId === null || value.lastPassId !== value.pendingPassId) &&
  (value.passes === 0
    ? value.lastPassId === null
    : browserUnreadId(value.lastPassId)) &&
  (value.receiptPassId === null ||
    (browserUnreadId(value.receiptPassId) &&
      [value.lastPassId, value.pendingPassId].includes(value.receiptPassId)));

const validPollingCounts = (value, normalized) =>
  Number.isSafeInteger(value.passes) &&
  value.passes >= 0 &&
  Number.isSafeInteger(value.failures) &&
  value.failures >= 0 &&
  value.failures <= normalized.maxFailures;

export const validUnreadPolling = (value, parentId) => {
  if (value === undefined) {
    return true;
  }
  try {
    const normalized = normalizeUnreadPolling(value.settings);
    return (
      Object.keys(normalized).every(
        (key) => normalized[key] === value.settings[key]
      ) &&
      [
        'starting',
        'visiting',
        'waiting',
        'owner-active',
        'backoff',
        'settled',
      ].includes(value.phase) &&
      validPollingCounts(value, normalized) &&
      Number.isFinite(Date.parse(value.expiresAt)) &&
      (value.nextAt === null || Number.isFinite(Date.parse(value.nextAt))) &&
      validPollingIds(value, parentId) &&
      (value.reason === undefined || boundedBrowserText(value.reason, 120))
    );
  } catch {
    return false;
  }
};

/** Only a definitely unissued or wholly restored child may be retried. */
const retryableEmptyFailure = (child) =>
  child.state === 'failed' &&
  child.entries?.length === 0 &&
  child.restoration?.restored &&
  ['ETIMEDOUT', 'timeout'].includes(child.code);

export const unreadPollingOutcome = (child, unissued = false) => {
  if (child.state === 'completed' && child.restoration?.restored) {
    return 'waiting';
  }
  if (
    child.entries?.length === 0 &&
    ['browser-background-owner-active', 'browser-owner-active'].includes(
      child.code
    )
  ) {
    return 'owner-active';
  }
  if (
    (unissued && child.code === 'question-unread-active') ||
    retryableEmptyFailure(child)
  ) {
    return 'backoff';
  }
  return 'settled';
};
