import { putAll } from '../storage/universal.js';
import { collectVkAttachments } from './vk-attachment-metadata.js';

/** Keep collection writes ahead of pull cursors without changing message counts. */
export const storeSourceMessages = async (store, source, messages) => {
  const count = await putAll(store, messages);
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
