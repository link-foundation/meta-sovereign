import { isDeepStrictEqual } from 'node:util';
import { messageTime } from '../crm/message-time.js';
import { messageLinkProperties } from '../message-link-targets.js';
import { toBrowserMessageLink } from '../sources/browser-message.js';
import { checkBrowserQuestion } from './question-browser-state.js';
import { learnObservedAnswers } from './question-store.js';

const coherentHistory = [
  'provider-start',
  'rendered-start',
  'pass-limit',
  'history-limit',
  'time-limit',
];
const delivered = ['sent', 'delivered', 'read'];
const unavailable = ['pending', 'sending', 'failed', 'unknown'];

const confirmedMessage = (message, saved) =>
  !saved.deleted &&
  !saved.pending &&
  !saved.failed &&
  !unavailable.includes(saved.status) &&
  !unavailable.includes(message.delivery) &&
  (message.outgoing
    ? delivered.includes(message.delivery)
    : saved.out !== true && saved.sender !== 'me');

const matchesTail = (row, question) =>
  row?.id === question.id &&
  row.body === question.body &&
  row.outgoing === question.outgoing &&
  isDeepStrictEqual(
    messageLinkProperties(row.links),
    messageLinkProperties(question.links)
  );

const archivedTurn = async (store, source, chat, rows, signal) => {
  const transcript = [];
  let previous = -Infinity;
  for (const row of rows) {
    signal.throwIfAborted();
    const message = {
      ...toBrowserMessageLink(source, chat, row),
      service: row.service === true,
      links: messageLinkProperties(row.links).links ?? [],
    };
    if (message.id.length > 500) {
      return null;
    }
    const saved = await store.get(message.id);
    if (
      !saved ||
      Object.entries(message).some(
        ([key, value]) => !isDeepStrictEqual(value, saved[key])
      )
    ) {
      return null;
    }
    const time = messageTime(message.timestamp);
    const confirmed = confirmedMessage(message, saved);
    if (message.service) {
      transcript.push(message);
      previous = -Infinity;
    } else if (time < previous || !confirmed || !Number.isFinite(time)) {
      // An uncertain outgoing fragment must not turn a partial answer into a
      // proposal. A verified incoming bubble still closes the preceding turn.
      transcript.push(
        confirmed && !message.outgoing && !Number.isFinite(time)
          ? { ...message, service: true }
          : null
      );
      previous = -Infinity;
    } else {
      transcript.push(message);
      previous = time;
    }
  }
  return transcript;
};

/** Use only contiguous native history acknowledged during this specific visit. */
const learnUnreadHistory = ({
  store,
  source,
  snapshot,
  history,
  handle,
  input,
  signal,
}) => {
  const rows = history?.rows;
  if (
    history?.restored !== true ||
    history.coverage?.scope !== 'conversation' ||
    !coherentHistory.includes(history.coverage.reason) ||
    !Array.isArray(rows) ||
    rows.length < 2 ||
    rows.length > 5000 ||
    !rows.some(
      (row) =>
        row?.outgoing &&
        !row.service &&
        delivered.includes(row.delivery) &&
        Number.isFinite(messageTime(row.timestamp))
    )
  ) {
    return 0;
  }
  return learnObservedAnswers(store, input, {
    signal,
    includeSummaries: false,
    readCurrent: async () => {
      const current = checkBrowserQuestion(await handle.readInactiveQuestion());
      if (
        !isDeepStrictEqual(current, snapshot) ||
        !matchesTail(rows.at(-1), current.question)
      ) {
        return null;
      }
      return archivedTurn(store, source, current.chat, rows, signal);
    },
  });
};

export const unreadHistoryAnswerReceipt = async (input) => {
  try {
    const count = await learnUnreadHistory(input);
    if (count === null) {
      return { reason: 'question-unread-history-unverified' };
    }
    return count > 0 ? { historyAnswers: count } : {};
  } catch (error) {
    if (input.signal.aborted) {
      throw error;
    }
    return { reason: 'question-unread-history-save-failed' };
  }
};
