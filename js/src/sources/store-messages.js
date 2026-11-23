import { putAll } from '../storage/universal.js';
import { importMessageVersions } from '../storage/message-version-id.js';
import { historicalMutation } from '../storage/mutation.js';
import { collectVkAttachments } from './vk-attachment-metadata.js';

export const putSourceMessageBatch = async (store, messages, options) => {
  if (
    !messages.some((message) => Object.hasOwn(message, importMessageVersions))
  ) {
    return putAll(store, messages, options);
  }
  const recordings = new Map();
  const links = messages.map(
    ({ [importMessageVersions]: recorded, ...link }) => {
      if (recorded) {
        recordings.set(link.id, recorded);
      }
      return link;
    }
  );
  if (typeof store[importMessageVersions] !== 'function') {
    throw new Error('HeadHunter recordings require message version storage');
  }
  const saved = await store[importMessageVersions](links, recordings, {
    ...options,
    [historicalMutation]: true,
  });
  return saved.length;
};

/** Keep collection writes ahead of pull cursors without changing message counts. */
export const storeSourceMessages = async (store, source, messages, options) => {
  const count = await putSourceMessageBatch(store, messages, options);
  if (source === 'vk') {
    await collectVkAttachments(store, messages);
  }
  return count;
};

export const storeSourceLink = async (store, link) => {
  const saved = await store.put(link);
  if (link.source === 'vk') {
    await collectVkAttachments(store, [link]);
  }
  return saved;
};
