import { isDeepStrictEqual } from 'node:util';
import { messageLinkProperties } from '../message-link-targets.js';
import { checkBrowserQuestion } from './question-browser-state.js';
import {
  acknowledgedBrowserTurn,
  hasDatedBrowserReply,
} from './question-observed-history.js';
import { learnObservedAnswers } from './question-store.js';

const coherentHistory = [
  'provider-start',
  'rendered-start',
  'pass-limit',
  'history-limit',
  'time-limit',
];
const matchesTail = (row, question) =>
  row?.id === question.id &&
  row.body === question.body &&
  row.outgoing === question.outgoing &&
  isDeepStrictEqual(
    messageLinkProperties(row.links),
    messageLinkProperties(question.links)
  );

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
    !hasDatedBrowserReply(rows)
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
      return acknowledgedBrowserTurn(store, source, current.chat, rows, signal);
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
