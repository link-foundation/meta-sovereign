import { historyOrder } from '../replies/history-order.js';
import { asksQuestion } from './question-match.js';
import { completedAnswerSummary } from './question-summary.js';
import { answerChoiceState } from './question-options.js';

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
const ordinaryLatest = (latest, choices) =>
  completedAnswerSummary(latest.body) ||
  (!choices.strictOptions && !asksQuestion(latest.body));

const unansweredQuestions = (messages, owners, latest) => {
  const unanswered = [];
  for (const message of messages.toReversed()) {
    if (
      outgoing(message, owners) ||
      message.service ||
      message.deleted ||
      Date.parse(latest.timestamp) - Date.parse(message.timestamp) > 86400000 ||
      !asksQuestion(message.body)
    ) {
      break;
    }
    if (
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
export const chatQuestionTurn = (input, ownerIds = [], modelDraft = false) => {
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
  const choices = latestChoiceState(latest);
  if (!choices) {
    return unavailable();
  }
  if (ordinaryLatest(latest, choices)) {
    return { latest, question: latest.body };
  }
  // Consecutive-question assembly belongs to the explicit model opt-in.
  // Existing saved-answer automations continue to answer the latest message.
  const unanswered =
    modelDraft && !choices.strictOptions
      ? unansweredQuestions(messages, owners, latest)
      : [latest];
  if (!unanswered) {
    return unavailable();
  }
  const question =
    unanswered.map((message) => message.body).join('\n') || latest.body;
  if (question.length > 6000) {
    return unavailable();
  }
  return {
    latest,
    question,
    turn: {
      owners,
      messages: unanswered.map(questionSnapshot),
    },
  };
};
