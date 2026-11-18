import { putAll } from '../storage/universal.js';
import { isTombstone } from '../storage/soft-delete.js';
import { extractTelegramLinks, messageLinkFields } from './telegram-links.js';

export const FOLLOW_LINK_PREFIX = 'follow-link:';
const busy = new WeakSet();
const run = async (store, action) => {
  if (busy.has(store)) {
    throw Object.assign(
      new Error('Follow cache is busy; retry after the current operation'),
      {
        code: 'follow-cache-busy',
      }
    );
  }
  busy.add(store);
  try {
    return await action();
  } finally {
    busy.delete(store);
  }
};
const integer = (value, fallback, max) => {
  const validType =
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d+$/u.test(value));
  const n = value === undefined ? fallback : validType ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    throw new Error(`expected an integer between 0 and ${max}`);
  }
  return n;
};
const matches = (record, input) =>
  (!input.source || record.source === input.source) &&
  (!input.chat || String(record.chat) === String(input.chat));
const incoming = (record, self) =>
  record?.id?.startsWith('msg:') &&
  !isTombstone(record) &&
  !record.service &&
  !record.outgoing &&
  !record.out &&
  !record.raw?.out &&
  !record.raw?.outgoing &&
  !self.has(String(record.sender));
const scan = async (store, filter, onBatch, project = (record) => record) => {
  if (typeof store.scan === 'function') {
    await store.scan(filter, 32, onBatch, project);
  } else {
    // Compatibility stores may materialize matches. Production stores stream.
    const records = await store.query(filter);
    for (let i = 0; i < records.length; i += 32) {
      await onBatch(records.slice(i, i + 32).map(project));
    }
  }
};
const reference = (message, target, at) => ({
  id: `${FOLLOW_LINK_PREFIX}${encodeURIComponent(message.id)}:${encodeURIComponent(target.url)}`,
  tokens: ['follow-link', message.source, String(message.chat)],
  ...target,
  source: message.source,
  chat: String(message.chat),
  messageId: message.id,
  sender: String(message.sender ?? ''),
  timestamp: message.timestamp ?? null,
  cachedAt: at,
});

export const extractFollowLinks = async (store, input = {}) =>
  run(store, async () => {
    const limit = integer(input.limit, 10000, 1000000);
    if (input.self !== undefined && !Array.isArray(input.self)) {
      throw new Error('self must be an array of account identifiers');
    }
    const self = new Set(['me', ...(input.self ?? []).map(String)]);
    const coverage = {
      messages: 0,
      scanned: 0,
      truncatedMessages: 0,
      limited: false,
    };
    const at = new Date().toISOString();
    let found = 0;
    let added = 0;
    await scan(
      store,
      (message) => {
        if (!incoming(message, self) || !matches(message, input)) {
          return false;
        }
        coverage.messages++;
        return !limit || coverage.messages <= limit;
      },
      async (messages) => {
        const pending = [];
        for (const message of messages) {
          coverage.scanned++;
          const result = extractTelegramLinks(messageLinkFields(message));
          coverage.truncatedMessages += Number(result.limited);
          found += result.links.length;
          for (const target of result.links) {
            const link = reference(message, target, at);
            if (!(await store.get(link.id, () => true))) {
              pending.push(link);
              added++;
            }
          }
        }
        await putAll(store, pending);
      }
    );
    coverage.limited =
      coverage.messages > coverage.scanned || coverage.truncatedMessages > 0;
    return { found, added, coverage, scope: 'cached-incoming-messages' };
  });

export const listFollowLinks = async (store, input = {}) =>
  run(store, async () => {
    const offset = integer(input.offset, 0, 1000000000);
    const limit = integer(input.limit, 50, 200);
    if (!limit) {
      throw new Error('list limit must be at least 1');
    }
    const links = [];
    let total = 0;
    await scan(
      store,
      (link) => {
        if (!link.id.startsWith(FOLLOW_LINK_PREFIX) || !matches(link, input)) {
          return false;
        }
        const index = total++;
        return index >= offset && index < offset + limit;
      },
      async (batch) => links.push(...batch),
      (link) => ({ ...link })
    );
    return { links, total, offset, limit, more: offset + links.length < total };
  });

export const clearFollowLinks = async (store, input = {}) =>
  run(store, async () => {
    let cleared = 0;
    await scan(
      store,
      (link) => link.id.startsWith(FOLLOW_LINK_PREFIX) && matches(link, input),
      async (ids) => {
        for (const id of ids) {
          cleared += Number(await store.delete(id));
        }
      },
      (link) => link.id
    );
    return { cleared };
  });
