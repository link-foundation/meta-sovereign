import { isDeepStrictEqual } from 'node:util';
import { messageLinkProperties } from '../message-link-targets.js';
import { checkBrowserQuestion } from './question-browser-state.js';
import { learnObservedSummary } from './question-store.js';

const unavailable = (message) =>
  message.service ||
  message.deleted ||
  message.pending ||
  message.failed ||
  ['pending', 'sending', 'failed', 'unknown'].includes(
    message.delivery ?? message.status
  );

const matchesArchivedSummary = (message, { id, source, chat, question }) =>
  message?.id === id &&
  message.source === source &&
  message.chat === chat &&
  message.via === 'browser' &&
  message.outgoing === false &&
  message.out !== true &&
  !unavailable(message) &&
  message.body === question.body &&
  isDeepStrictEqual(
    messageLinkProperties(message.links),
    messageLinkProperties(question.links)
  );

/** Bind the saved fact to this visit's still-current, durably captured bubble. */
export const learnUnreadSummary = ({
  store,
  source,
  snapshot,
  handle,
  input,
  signal,
}) =>
  learnObservedSummary(store, input, {
    signal,
    readCurrent: async () => {
      const current = checkBrowserQuestion(await handle.readInactiveQuestion());
      signal.throwIfAborted();
      if (!isDeepStrictEqual(current, snapshot)) {
        return null;
      }
      const { chat, question } = current;
      const id = `msg:${source}:${chat}:${question.id}`;
      if (id.length > 500) {
        return null;
      }
      const message = await store.get(id);
      return matchesArchivedSummary(message, { id, source, chat, question })
        ? message
        : null;
    },
  });
