import { historyOrder } from '../replies/history-order.js';
import { answerChoiceState } from './question-options.js';
import { checkedPendingMessages } from './question-pending-plan.js';

const unavailable = () => ({ reason: 'question-turn-unavailable' });
export const chatAnswerAction = (action) => ({
  ...action,
  matching: { threshold: 0.7, ...action.matching },
});
const pending = (message) =>
  message.pending ||
  message.failed ||
  ['unknown', 'failed', 'pending'].includes(message.delivery ?? message.status);
const outgoing = (message, owners) =>
  owners.includes(String(message.sender)) ||
  message.out === true ||
  message.outgoing === true;
const usableLatest = (message) =>
  !message.service &&
  !message.deleted &&
  !pending(message) &&
  typeof message.body === 'string' &&
  message.body.length <= 6000;
const questionSnapshot = ({
  id,
  body,
  timestamp,
  answerOptions,
  strictOptions,
}) => ({
  id,
  body,
  timestamp,
  options: JSON.stringify(answerOptions),
  strictOptions,
});

const latestChoiceState = (latest) => {
  try {
    return answerChoiceState(latest.body, {
      options: latest.answerOptions,
      strictOptions: latest.strictOptions,
    });
  } catch {
    return null;
  }
};
const unansweredMessages = (messages, owners) => {
  const unanswered = [];
  for (const message of messages.toReversed()) {
    if (outgoing(message, owners) || message.service) {
      break;
    }
    if (
      message.deleted ||
      pending(message) ||
      typeof message.body !== 'string' ||
      message.body.length > 6000
    ) {
      return null;
    }
    unanswered.unshift(message);
    if (unanswered.length > 20) {
      return null;
    }
  }
  return unanswered;
};

/** Latest contiguous unanswered employer turn, bounded independently of archive size. */
export const chatQuestionTurn = (input, ownerIds = []) => {
  const owners = [...new Set(['me', ...ownerIds.map(String)])];
  if (
    input.some((message) => !Number.isFinite(Date.parse(message.timestamp)))
  ) {
    return unavailable();
  }
  const messages = input.toSorted(historyOrder);
  const latest = messages.at(-1);
  if (!latest || outgoing(latest, owners)) {
    return { reason: 'question-already-answered' };
  }
  if (!usableLatest(latest)) {
    return unavailable();
  }
  if (!latestChoiceState(latest)) {
    return unavailable();
  }
  const unanswered = unansweredMessages(messages, owners);
  if (!unanswered) {
    return unavailable();
  }
  let pendingMessages;
  try {
    pendingMessages = checkedPendingMessages(unanswered, latest.body);
  } catch {
    return unavailable();
  }
  return {
    latest,
    question: latest.body,
    pendingMessages,
    turn: {
      owners,
      messages: unanswered.map(questionSnapshot),
    },
  };
};
