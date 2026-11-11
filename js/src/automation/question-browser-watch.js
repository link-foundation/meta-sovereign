import { randomUUID } from 'node:crypto';
import { checkBrowserQuestion } from './question-browser-state.js';
import {
  questionWatchFailure as failure,
  questionWatchStatus,
  saveQuestionWatch,
  questionWatchReview,
  validWatchStart,
  readQuestionWatch,
} from './question-watch-records.js';
import { createQuestionWatchCycle } from './question-watch-cycle.js';

const openWatch = async (context, runtime, review) => {
  await context.store.put(runtime.record);
  runtime.handle = await context.send.openAnswerWatch(review.target);
  const snapshot = checkBrowserQuestion(await runtime.handle.read());
  if (JSON.stringify(snapshot) !== JSON.stringify(review.snapshot)) {
    throw failure('question-watch-page-changed');
  }
};

/** Explicit, finite current-chat automation; recovered records never resume it. */
export const createQuestionBrowserWatches = ({
  store,
  send,
  clock,
  log,
  intervalMs = 1500,
}) => {
  const running = new Map();
  const slots = new Set();
  const context = { store, send, clock, log, intervalMs };
  let closed = false;
  const status = (input) => questionWatchStatus(store, running, input);
  const release = (runtime) => {
    runtime.release ??= (async () => {
      try {
        await runtime.handle?.close();
      } finally {
        running.delete(runtime.record.id);
        slots.delete(runtime.record.target.source);
      }
    })();
    return runtime.release;
  };
  const stop = async (input) => {
    const runtime = running.get(input?.id);
    if (runtime) {
      await runtime.cycle.stop();
    } else {
      const record = await readQuestionWatch(store, input);
      if (record.state === 'paused') {
        await saveQuestionWatch(
          context,
          { record },
          {
            state: 'stopped',
            reason: 'owner-stopped',
          }
        );
      }
    }
    return status(input);
  };
  return {
    status,
    stop,
    async start(input = {}) {
      if (closed || !validWatchStart(input)) {
        throw failure('question-watch-confirm-required');
      }
      // A repeated HTTP request only recovers the first record, even after restart.
      if (await store.get(input.id)) {
        return status(input);
      }
      const { review, durationMs } = await questionWatchReview(context, input);
      const existing = running.get(input.id);
      if (existing) {
        await existing.opening;
        return status(input);
      }
      if (closed) {
        throw failure('question-watch-stopped');
      }
      if (slots.has(review.target.source)) {
        throw failure('question-watch-busy');
      }
      slots.add(review.target.source);
      const runtime = {
        record: {
          id: input.id,
          kind: 'question-browser-watch',
          tokens: ['question-browser-watch', review.target.source],
          target: review.target,
          state: 'active',
          phase: 'starting',
          createdAt: clock().toISOString(),
          expiresAt: new Date(clock().getTime() + durationMs).toISOString(),
        },
      };
      runtime.fresh = () =>
        !closed &&
        !runtime.stopping &&
        clock().getTime() < Date.parse(runtime.record.expiresAt);
      runtime.cycle = createQuestionWatchCycle(context, runtime, () =>
        release(runtime)
      );
      running.set(input.id, runtime);
      runtime.pending = runtime.opening = openWatch(context, runtime, review);
      try {
        await runtime.pending;
        if (closed || runtime.stopping) {
          throw failure('question-watch-stopped');
        }
        runtime.cycle.run();
        return status(input);
      } catch (error) {
        try {
          await saveQuestionWatch(context, runtime, {
            state: 'paused',
            reason: error.code ?? 'question-watch-failed',
          });
        } finally {
          await release(runtime);
        }
        throw error;
      }
    },
    async close() {
      closed = true;
      const results = await Promise.allSettled(
        [...running.keys()].map((id) => stop({ id }))
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) {
        throw failed.reason;
      }
    },
  };
};

export const newBrowserWatchId = () => `question-watch:${randomUUID()}`;
