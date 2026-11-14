import { autoConfigReceipt, automaticReceipt } from './follow-auto-receipt.js';

const integer = (n, min, max) =>
  Number.isSafeInteger(n) && n >= min && n <= max;
const id = (value) => typeof value === 'string' && /^[1-9]\d*$/u.test(value);
const chat = (value, source) =>
  typeof value === 'string' &&
  (source === 'telegram'
    ? /^-[1-9]\d{0,23}$/u.test(value)
    : integer(Number(value), 2000000001, 2147483647));
const states = new Set([
  'ready',
  'sending',
  'monitoring',
  'survived',
  'rejected',
  'skipped',
  'unknown',
  'failed',
]);
const statuses = new Set([
  'queued',
  'running',
  'paused',
  'confirmed',
  'rejected',
  'unknown',
  'failed',
]);
const cleanup = (value) => {
  if (
    !value ||
    !['sending', 'confirmed', 'unknown'].includes(value.status) ||
    !Array.isArray(value.ids) ||
    !Array.isArray(value.confirmed)
  ) {
    return false;
  }
  const ids = new Set(value.ids);
  return (
    value.ids.length <= 200 &&
    ids.size === value.ids.length &&
    value.ids.every(id) &&
    new Set(value.confirmed).size === value.confirmed.length &&
    value.confirmed.every((v) => ids.has(v)) &&
    (value.status !== 'confirmed' ||
      value.confirmed.length === value.ids.length)
  );
};
const row = (value, source) => {
  if (
    !value ||
    !chat(value.chat, source) ||
    typeof value.title !== 'string' ||
    !states.has(value.status)
  ) {
    return false;
  }
  if (value.cleanup !== undefined && !cleanup(value.cleanup)) {
    return false;
  }
  return (
    !['monitoring', 'survived', 'rejected'].includes(value.status) ||
    (id(value.messageId) &&
      Number.isFinite(value.sentAt) &&
      integer(value.checks, 0, Number.MAX_SAFE_INTEGER))
  );
};
export const backlinkRowsReceipt = (value, source = 'vk') =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 100 &&
  value.every((v) => row(v, source)) &&
  new Set(value.map((v) => v.chat)).size === value.length;
const timing = (value) =>
  integer(value.monitorMs, 1000, 3600000) &&
  integer(value.intervalMs, 1000, 300000) &&
  integer(value.delayMs, 0, 60000) &&
  integer(value.historyLimit, 1, 200) &&
  integer(value.retry?.attempts, 1, 10) &&
  integer(value.retry?.delayMs, 0, 60000) &&
  integer(value.retry?.maxDelayMs, value.retry.delayMs, 300000);
export const backlinkConfigReceipt = (value) =>
  value &&
  ['vk', 'telegram'].includes(value.source) &&
  ['telegram', 'vk'].includes(value.targetSource) &&
  typeof value.backlink === 'string' &&
  value.backlink.length <= 2048 &&
  Array.isArray(value.chats) &&
  value.chats.length > 0 &&
  value.chats.length <= 100 &&
  value.chats.every((v) => chat(v, value.source)) &&
  new Set(value.chats).size === value.chats.length &&
  typeof value.deleteIncoming === 'boolean' &&
  timing(value) &&
  autoConfigReceipt(value.autoFollow, value.targetSource);
export const backlinkJobReceipt = (value) => {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^follow-backlink-job:[a-f\d-]{36}$/u.test(value.id) ||
    !statuses.has(value.status) ||
    !id(value.owner) ||
    !backlinkConfigReceipt(value.config) ||
    !backlinkRowsReceipt(value.rows, value.config.source) ||
    !automaticReceipt(value)
  ) {
    return false;
  }
  if (
    value.config.chats.length !== value.rows.length ||
    !value.rows.every((v) => value.config.chats.includes(v.chat))
  ) {
    return false;
  }
  return (
    value.status !== 'confirmed' ||
    value.rows.every(
      (v) =>
        v.status === 'survived' &&
        Number.isFinite(v.checkedAt) &&
        v.checkedAt >= v.sentAt + value.config.monitorMs &&
        (!value.config.deleteIncoming || v.cleanup?.status === 'confirmed') &&
        (!v.cleanup || v.cleanup.status === 'confirmed')
    )
  );
};
