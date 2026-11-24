import {
  boundedBrowserText,
  browserChoiceReceipt,
} from './question-browser-state.js';
import { outboxId } from './outbox.js';

const reviewPhases = [
  'review',
  'no-reply',
  'pending-options',
  'choice-review',
  'owner-draft',
  'prefilled',
  'form-review',
  'skipped',
];
const effectPhases = ['selecting', 'sent', 'marked-sent', 'unknown', 'failed'];
const validCount = (value, max) =>
  Number.isSafeInteger(value) && value >= 1 && value <= max;

/** A selection and positive receipt must agree on their durable identity. */
export const validUnreadAnswer = (value, source, chat) => {
  if (
    !boundedBrowserText(value?.questionId, 480) ||
    ![...reviewPhases, ...effectPhases].includes(value.phase) ||
    (value.reason !== undefined && !boundedBrowserText(value.reason, 120)) ||
    (value.historyAnswers !== undefined &&
      !validCount(value.historyAnswers, 100000)) ||
    (value.summaryAnswers !== undefined &&
      (!['no-reply', 'form-review', 'review'].includes(value.phase) ||
        !validCount(value.summaryAnswers, 400)))
  ) {
    return false;
  }
  const { selection, outbox, phase } = value;
  if (!selection) {
    return !outbox && reviewPhases.includes(phase);
  }
  if (
    !effectPhases.includes(phase) ||
    selection.chat !== chat ||
    !boundedBrowserText(selection.option, 6000) ||
    !boundedBrowserText(selection.key, 2000)
  ) {
    return false;
  }
  if (
    outbox &&
    (outbox.id !== outboxId(selection.key) ||
      outbox.source !== source ||
      outbox.chat !== chat ||
      outbox.text !== selection.option ||
      !['sending', 'sent', 'unknown', 'failed'].includes(outbox.status))
  ) {
    return false;
  }
  if (phase === 'sent' || phase === 'marked-sent') {
    return (
      outbox?.status === 'sent' &&
      (phase === 'marked-sent'
        ? outbox.resolvedBy === 'user'
        : outbox.resolvedBy !== 'user' &&
          Boolean(
            browserChoiceReceipt(outbox.receipt, {
              source,
              chat,
              text: selection.option,
            })
          ))
    );
  }
  return phase !== 'unknown' || ['sending', 'unknown'].includes(outbox?.status);
};

/** Recover reservations from their authoritative outbox without another click. */
export const unreadAnswerStatus = async (store, entry) => {
  if (!entry.answer?.selection) {
    return entry;
  }
  const stored = await store.get(outboxId(entry.answer.selection.key));
  const outbox =
    entry.answer.outbox?.status === 'sent'
      ? entry.answer.outbox
      : (stored ?? entry.answer.outbox);
  if (!outbox) {
    return entry;
  }
  return {
    ...entry,
    answer: {
      ...entry.answer,
      outbox,
      phase:
        outbox.status === 'sent'
          ? outbox.resolvedBy === 'user'
            ? 'marked-sent'
            : 'sent'
          : ['sending', 'unknown'].includes(outbox.status)
            ? 'unknown'
            : 'failed',
    },
  };
};
