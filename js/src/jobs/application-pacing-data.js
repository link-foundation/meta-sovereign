import { applicationFailure as fail } from './application-options.js';

export const applicationPacingPrefix = 'secret:jobs-application-pacing:';
export const applicationPacingId = `${applicationPacingPrefix}hh`;
const interval = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 86400;
export const applicationInterval = (value) => {
  if (!interval(value)) {
    throw fail('input');
  }
  return value;
};
const date = (value) =>
  typeof value === 'string' &&
  value.length <= 40 &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const token = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/u.test(value);
const timing = (row) =>
  date(row.startedAt) &&
  date(row.nextAt) &&
  interval(row.intervalSeconds) &&
  Number.isInteger(row.baseMs) &&
  row.baseMs >= 60000 &&
  row.baseMs <= 240000 &&
  Number.isFinite(row.variation) &&
  row.variation >= 0 &&
  row.variation < 1 &&
  Number.isInteger(row.intervalMs) &&
  row.intervalMs ===
    (row.intervalSeconds === 0
      ? Math.min(
          240000,
          row.baseMs + Math.floor((row.baseMs * row.variation) / 4)
        )
      : row.intervalSeconds * 1000) &&
  Date.parse(row.nextAt) - Date.parse(row.startedAt) === row.intervalMs;
const hold = (row) =>
  (row.holdStartedAt === null && row.holdUntil === null) ||
  (date(row.holdStartedAt) &&
    date(row.holdUntil) &&
    Date.parse(row.holdUntil) - Date.parse(row.holdStartedAt) >= 0 &&
    Date.parse(row.holdUntil) - Date.parse(row.holdStartedAt) <= 900000);
const identity = (row) =>
  token(row.requestId) &&
  typeof row.applicationId === 'string' &&
  /^secret:jobs-application:[a-zA-Z0-9_-]{1,80}:\d{1,100}$/u.test(
    row.applicationId
  );
const documents = (row) =>
  Array.isArray(row.documents) &&
  row.documents.length <= 64 &&
  new Set(row.documents).size === row.documents.length &&
  row.documents.every(token);
export const readApplicationPacingRow = (row) => {
  if (row === undefined || row === null) {
    return null;
  }
  if (
    row.id !== applicationPacingId ||
    row.version !== 1 ||
    row.scope !== 'workspace' ||
    !timing(row) ||
    !hold(row) ||
    !count(row.deliveries) ||
    !count(row.challenges) ||
    typeof row.delivered !== 'boolean' ||
    !identity(row) ||
    !documents(row)
  ) {
    throw fail('pacing-journal');
  }
  return globalThis.structuredClone(row);
};

const publicTiming = (value) =>
  ['adaptive', 'fixed'].includes(value.mode) &&
  date(value.startedAt) &&
  date(value.nextAt) &&
  Number.isInteger(value.intervalMs) &&
  value.intervalMs >= 1000 &&
  value.intervalMs <= 86400000 &&
  Date.parse(value.nextAt) - Date.parse(value.startedAt) === value.intervalMs &&
  Number.isInteger(value.baseMs) &&
  value.baseMs >= 60000 &&
  value.baseMs <= 240000 &&
  (value.mode !== 'adaptive' ||
    (value.intervalMs >= value.baseMs && value.intervalMs <= 240000));

/** Public schedule metadata contains neither application identities nor answers. */
export const applicationPacingData = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    value.scope !== 'workspace' ||
    !publicTiming(value) ||
    !count(value.deliveries) ||
    !count(value.challenges) ||
    typeof value.waiting !== 'boolean' ||
    typeof value.saved !== 'boolean' ||
    !(value.holdUntil === null || date(value.holdUntil))
  ) {
    throw fail('pacing-journal');
  }
  return globalThis.structuredClone(value);
};
