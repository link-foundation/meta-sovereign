/** First-observed incoming VK attachment metadata; never downloads media. */
import { putAll } from '../storage/universal.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';

export const VK_ATTACHMENT_PREFIX = 'attachment:vk:';
const SETTINGS = 'setting:vk:attachment-collection';
const serialized = createStoreQueue();
const numericId = (value) => /^-?[1-9]\d{0,19}$/u.test(String(value ?? ''));
const externalIdValid = (value) => /^[1-9]\d{0,19}$/u.test(String(value ?? ''));
const omittedKey =
  /^(?:__proto__|constructor|prototype|access_?key|access_?token|refresh_?token|token|password|cookie|authorization)$/iu;

// Bound individual records while keeping the provider's nested media metadata.
// Invalid/oversized records are skipped rather than stored as complete metadata.
const cleanMetadata = (input) => {
  let nodes = 0;
  let characters = 0;
  const fieldsOf = (value, depth) => {
    const fields = [];
    for (const key in value) {
      if (!Object.hasOwn(value, key) || omittedKey.test(key)) {
        continue;
      }
      characters += key.length;
      if (characters > 32768) {
        throw new Error('attachment metadata budget');
      }
      const item = visit(value[key], depth + 1);
      if (item !== undefined) {
        fields.push([key, item]);
      }
    }
    return Object.fromEntries(fields);
  };
  const visit = (value, depth) => {
    if (++nodes > 512 || depth > 8) {
      throw new Error('attachment metadata budget');
    }
    if (typeof value === 'string') {
      characters += value.length;
      if (characters > 32768) {
        throw new Error('attachment metadata budget');
      }
      return value || undefined;
    }
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== 'object') {
      return typeof value === 'boolean' || Number.isFinite(value)
        ? value
        : undefined;
    }
    if (Array.isArray(value)) {
      if (value.length > 512) {
        throw new Error('attachment metadata budget');
      }
      const list = value
        .map((item) => visit(item, depth + 1))
        .filter((item) => item !== undefined);
      return list.length ? list : undefined;
    }
    return fieldsOf(value, depth);
  };
  return visit(input, 0);
};

const attachmentRecord = (message, attachment) => {
  const type = attachment?.type;
  const value = attachment?.[type];
  if (
    !/^[a-z_]{1,32}$/u.test(type ?? '') ||
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }
  const externalId = value.sticker_id ?? value.id;
  const owner = value.owner_id ?? value.ownerId;
  if (
    !externalIdValid(externalId) ||
    (!numericId(owner) && !['sticker', 'gift'].includes(type))
  ) {
    return null;
  }
  let metadata;
  try {
    metadata = cleanMetadata(value);
  } catch {
    return null;
  }
  const ownerId = numericId(owner) ? String(owner) : 'global';
  return {
    id: `${VK_ATTACHMENT_PREFIX}${type}:${ownerId}:${externalId}`,
    tokens: ['attachment', 'vk', type, ownerId, String(externalId)],
    children: [],
    source: 'vk',
    type,
    ownerId,
    externalId: String(externalId),
    messageId: message.id,
    chat: message.chat,
    timestamp: message.timestamp,
    metadata,
  };
};

export const vkAttachmentSettings = async (store) => ({
  enabled: (await store.get(SETTINGS))?.enabled === true,
});

export const saveVkAttachmentSettings = (store, input) =>
  serialized(store, async () => {
    if (typeof input?.enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }
    await saveAcknowledgedRecord(store, {
      id: SETTINGS,
      enabled: input.enabled,
    });
    return { ok: true, settings: await vkAttachmentSettings(store) };
  });

const incomingMessage = (message) =>
  message?.source === 'vk' &&
  typeof message.id === 'string' &&
  message.id.startsWith('msg:vk:') &&
  message.outgoing !== true &&
  message.raw?.out !== 1 &&
  message.raw?.out !== true &&
  message.sender !== 'me' &&
  !message.deleted &&
  !message.service;

export const collectVkAttachments = (store, messages) =>
  serialized(store, async () => {
    if (!(await vkAttachmentSettings(store)).enabled) {
      return { created: 0, skipped: 0, paused: true };
    }
    const fresh = new Map();
    let skipped = 0;
    for (const message of messages) {
      if (!incomingMessage(message)) {
        continue;
      }
      const attachments = Array.isArray(message.raw?.attachments)
        ? message.raw.attachments
        : [];
      skipped += Math.max(0, attachments.length - 100);
      for (const attachment of attachments.slice(0, 100)) {
        const row = attachmentRecord(message, attachment);
        if (!row) {
          skipped += 1;
        } else if (!fresh.has(row.id) && !(await store.get(row.id))) {
          fresh.set(row.id, row);
        }
      }
    }
    try {
      await putAll(store, [...fresh.values()]);
      if (fresh.size) {
        await store.flush?.();
      }
    } catch (error) {
      for (const id of fresh.keys()) {
        await store.delete(id);
      }
      throw error;
    }
    return { created: fresh.size, skipped, paused: false };
  });

export const listVkAttachments = (store, { after = '', limit = 50 } = {}) =>
  serialized(store, async () => {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      typeof after !== 'string' ||
      after.length > 200
    ) {
      throw new Error('limit must be 1–100 and after a collection cursor');
    }
    const rows = [];
    const filter = (row) =>
      row.id.startsWith(VK_ATTACHMENT_PREFIX) && row.id > after;
    const accept = (batch) => {
      rows.push(...batch);
      rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      rows.length = Math.min(rows.length, limit + 1);
    };
    if (store.scan) {
      await store.scan(filter, 32, accept);
    } else {
      accept(await store.query(filter));
    }
    const more = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      ok: true,
      settings: await vkAttachmentSettings(store),
      items,
      next: more ? items.at(-1).id : null,
    };
  });
