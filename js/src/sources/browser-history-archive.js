import { isDeepStrictEqual } from 'node:util';
import { toBrowserMessageLink } from './browser-message.js';
import { storeSourceMessages } from './store-messages.js';
import { messageLinkProperties } from '../message-link-targets.js';

const invalid = () =>
  Object.assign(new Error('The observed browser history could not be saved.'), {
    code: 'question-history-save-failed',
    fallback: false,
  });
const boundedText = (value, max) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** Save only verified, bounded native rows; missing timestamps remain unknown. */
const project = ({ source, chat, rows }) => {
  if (
    !boundedText(source, 64) ||
    !boundedText(chat, 480) ||
    !Array.isArray(rows) ||
    rows.length > 500 ||
    new Set(rows.map((row) => row?.id)).size !== rows.length ||
    rows.some(
      (row) =>
        !boundedText(row?.id, 480) ||
        typeof row.body !== 'string' ||
        row.body.length > 6000 ||
        typeof row.outgoing !== 'boolean' ||
        (row.sender !== undefined &&
          row.sender !== null &&
          (typeof row.sender !== 'string' || row.sender.length > 4096))
    ) ||
    rows.reduce((size, row) => size + row.body.length, 0) > 1000000
  ) {
    throw invalid();
  }
  return rows.map((row) => ({
    ...toBrowserMessageLink(source, chat, row),
    service: row.service === true,
    links: messageLinkProperties(row.links).links ?? [],
  }));
};

/** A window must flush before scrolling away. Unchanged overlap creates no writes. */
export const archiveBrowserHistoryWindow = async (store, input) => {
  try {
    const messages = project(input);
    const changes = [];
    for (const message of messages) {
      if (input.signal?.aborted) {
        throw invalid();
      }
      const before = await store.get(message.id);
      if (
        !before ||
        Object.keys(message).some(
          (key) => !isDeepStrictEqual(message[key], before[key])
        )
      ) {
        changes.push({ ...before, ...message });
      }
    }
    if (input.signal?.aborted) {
      throw invalid();
    }
    if (changes.length) {
      await storeSourceMessages(store, input.source, changes);
    }
    // Even unchanged overlap may have pending writes from another owned service.
    await store.flush?.();
    return { observed: messages.length, changed: changes.length };
  } catch {
    // Storage/parser diagnostics can contain private message bodies or paths.
    throw invalid();
  }
};
