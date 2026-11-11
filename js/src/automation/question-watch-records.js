import {
  browserReviewId,
  browserWatchId,
  checkBrowserWatchReceipt,
} from './question-browser-state.js';
import { debugQuestionTurn } from './question-turns.js';
import { outboxId } from './outbox.js';

export const questionWatchFailure = (code) =>
  Object.assign(new Error('The provider question watcher was not confirmed.'), {
    code,
    fallback: false,
  });

export const readQuestionWatch = async (store, input) => {
  if (!browserWatchId(input?.id)) {
    throw questionWatchFailure('question-watch-missing');
  }
  const record = await store.get(input.id);
  if (record?.kind !== 'question-browser-watch') {
    throw questionWatchFailure('question-watch-missing');
  }
  return record;
};

const deliveryPhase = (record, outbox) => {
  if (outbox && ['selecting', 'unknown', 'failed'].includes(record.phase)) {
    if (outbox.status === 'sent') {
      return outbox.resolvedBy === 'user' ? 'marked-sent' : 'sent';
    }
    if (outbox.status === 'unknown') {
      return 'unknown';
    }
  }
  return record.phase;
};

export const questionWatchStatus = async (store, running, input) => {
  const record = await readQuestionWatch(store, input);
  const outbox = record.selection?.key
    ? await store.get(outboxId(record.selection.key))
    : record.outbox;
  const owned = running.has(record.id);
  return globalThis.structuredClone(
    checkBrowserWatchReceipt({
      ...record,
      ...(outbox
        ? {
            outbox,
            phase: deliveryPhase(record, outbox),
            selection: {
              ...record.selection,
              option: outbox.receipt?.option ?? record.selection.option,
            },
          }
        : {}),
      mode: 'browser-answer-watch',
      owned,
      ...(record.state === 'active' && !owned
        ? { state: 'paused', reason: 'owner-unavailable' }
        : {}),
    })
  );
};

export const saveQuestionWatch = async ({ store, clock }, runtime, patch) => {
  const next = { ...runtime.record, ...patch };
  if (JSON.stringify(next) !== JSON.stringify(runtime.record)) {
    next.updatedAt = clock().toISOString();
    await store.put(next);
    if (
      next.phase !== runtime.record.phase ||
      next.state !== runtime.record.state
    ) {
      debugQuestionTurn('browser-watch-state', {
        id: next.id,
        source: next.target.source,
        state: next.state,
        phase: next.phase,
        reason: next.reason,
      });
    }
    runtime.record = next;
  }
};

export const validWatchStart = (input) =>
  input?.confirm === true &&
  browserReviewId(input.review) &&
  browserWatchId(input.id);

export const questionWatchReview = async ({ store, send, clock }, input) => {
  const review = await store.get(input.review);
  const durationMs = input.durationMs ?? 120 * 60 * 1000;
  const sources = send?.answerWatchSources?.() ?? [];
  if (
    review?.kind !== 'question-browser' ||
    !review.planning ||
    !sources.some(({ id }) => id === review.target.source) ||
    typeof send.openAnswerWatch !== 'function' ||
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > 120 * 60 * 1000 ||
    clock().getTime() >= Date.parse(review.expiresAt)
  ) {
    throw questionWatchFailure('question-watch-unavailable');
  }
  return { review, durationMs };
};
