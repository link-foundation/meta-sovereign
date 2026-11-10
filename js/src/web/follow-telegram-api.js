import { followRetryPolicy } from '../follow/retry.js';
import { followReadQuery } from '../follow/read-policy.js';
const positive = (value) =>
  typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value);
const chatId = (value) =>
  typeof value === 'string' && /^-[1-9]\d{0,23}$/.test(value);
const target = (value) =>
  value &&
  (value.chat === null || chatId(value.chat)) &&
  ['Chat', 'Channel'].includes(value.kind) &&
  typeof value.title === 'string' &&
  typeof value.member === 'boolean' &&
  ['muted', 'archived'].every(
    (key) => value[key] === null || typeof value[key] === 'boolean'
  );
const phases = (rows) =>
  Array.isArray(rows) &&
  rows.length <= 3 &&
  rows.every(
    (row) =>
      row &&
      ['membership', 'mute', 'archive'].includes(row.phase) &&
      [
        'ready',
        'sending',
        'unknown',
        'pending',
        'confirmed',
        'skipped',
        'failed',
        'unsupported',
      ].includes(row.status)
  ) &&
  new Set(rows.map((row) => row.phase)).size === rows.length;
const validContinuation = (page) =>
  page.next === null ||
  (typeof page.next === 'string' &&
    page.next.length > 0 &&
    page.next.length <= 512 &&
    page.hasMore);
const validPage = (page, count) =>
  page &&
  Number.isInteger(page.limit) &&
  page.limit > 0 &&
  page.limit <= 100 &&
  Number.isInteger(page.scanned) &&
  page.scanned >= count &&
  page.scanned <= page.limit &&
  typeof page.hasMore === 'boolean' &&
  page.complete === !page.hasMore &&
  page.partial === (page.hasMore && !page.next) &&
  validContinuation(page);
const validList = (value) =>
  positive(value.owner) &&
  Array.isArray(value.chats) &&
  value.chats.length <= 100 &&
  value.chats.every((row) => target(row) && row.chat !== null && row.member) &&
  validPage(value.page, value.chats.length);
const validRetry = (retry) => {
  try {
    return (
      retry &&
      Object.entries(followRetryPolicy(retry)).every(
        ([key, value]) => retry[key] === value
      )
    );
  } catch {
    return false;
  }
};
const validPreview = (value) =>
  positive(value.owner) &&
  validRetry(value.retry) &&
  target(value.target) &&
  typeof value.planId === 'string' &&
  value.planId.length > 0 &&
  value.planId.length <= 64 &&
  ['join', 'leave', 'preferences'].includes(value.operation) &&
  ['mute', 'archive'].every(
    (key) =>
      value.options?.[key] === null || typeof value.options?.[key] === 'boolean'
  ) &&
  phases(value.phases) &&
  Number.isFinite(Date.parse(value.expiresAt));
const validResult = (action, value, input) => {
  if (!value || typeof value.ok !== 'boolean') {
    return false;
  }
  if (value.ok === false && typeof value.code === 'string' && !value.results) {
    return true;
  }
  if (action === 'list') {
    return validList(value);
  }
  if (action === 'preview') {
    return validPreview(value);
  }
  if (action === 'cancel') {
    return value.ok;
  }
  return (
    value.planId === input.planId &&
    phases(value.results) &&
    value.results.length > 0 &&
    (value.chat === null || chatId(value.chat)) &&
    value.ok ===
      value.results.every((row) =>
        ['confirmed', 'skipped'].includes(row.status)
      )
  );
};
const failure = (code) => Object.assign(new Error(code), { code });
export const followTelegramApi = ({ remote }) => {
  const request = async (action, input = {}) => {
    const read = action === 'list';
    const path = `/api/automations/follow/telegram${read ? `?${followReadQuery(input)}` : `/${action}`}`;
    let value;
    if (remote.request) {
      const response = await remote.request(
        path,
        read
          ? undefined
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(input),
            },
        { network: true }
      );
      if (!response) {
        throw failure('follow-server-required');
      }
      value = await response.json().catch(() => null);
    } else {
      value = read
        ? await remote.get(path)
        : await (remote.report ?? remote.post)(path, input, { network: true });
    }
    if (!validResult(action, value, input)) {
      throw failure(action === 'apply' ? 'outcome-unknown' : 'read-failed');
    }
    return value;
  };
  return {
    followTelegramList: (input) => request('list', input),
    followTelegramPreview: (input) => request('preview', input),
    followTelegramApply: async (input) => {
      try {
        return await request('apply', input);
      } catch {
        return { ok: false, code: 'outcome-unknown' };
      }
    },
    followTelegramCancel: (input = {}) => request('cancel', input),
  };
};
