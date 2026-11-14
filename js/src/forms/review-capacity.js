import { formFailure as failure } from './options.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';

const id = 'config:form-review-capacity';
const revisions = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u;
export const reviewCapacityValue = (value) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw failure(
      'form-capacity-invalid',
      'Use a positive safe integer for review capacity.'
    );
  }
  return value;
};

// Serialize settings and reservations, never browser startup, with the writer.
// A pending write must not admit a browser under an unconfirmed higher limit.
export const createReviewCapacity = ({ store, defaultLimit = 4, count }) => {
  reviewCapacityValue(defaultLimit);
  let current = { maxSessions: defaultLimit, revision: null };
  const queueKey = store ?? {};
  let stopped = false;
  const pending = new Set();
  const enqueue = (work) => {
    if (stopped) {
      return Promise.reject(
        failure('form-stopped', 'Form review is stopping.')
      );
    }
    const task = writeAnswerKnowledge(queueKey, async () => {
      if (stopped) {
        throw failure('form-stopped', 'Form review is stopping.');
      }
      return work();
    });
    pending.add(task);
    return task.finally(() => pending.delete(task));
  };
  const read = async () => {
    const saved = await store?.get(id);
    if (saved) {
      if (saved.id !== id || !revisions.test(saved.revision)) {
        throw failure(
          'form-capacity-invalid',
          'The saved review capacity is invalid.'
        );
      }
      current = {
        maxSessions: reviewCapacityValue(saved.maxSessions),
        revision: saved.revision,
      };
    } else {
      current = { maxSessions: defaultLimit, revision: null };
    }
    return { ...current };
  };
  return {
    current: () => ({ ...current }),
    stop: async () => {
      stopped = true;
      await Promise.allSettled([...pending]);
    },
    read: () => enqueue(read),
    reserve: (create) =>
      enqueue(async () => {
        const value = await read();
        return create(value.maxSessions);
      }),
    configure: (input = {}) =>
      enqueue(async () => {
        const maxSessions = reviewCapacityValue(input.maxSessions);
        const actual = await read();
        if (input.revision !== actual.revision) {
          throw failure(
            'form-capacity-changed',
            'Review capacity changed. Reload before saving.'
          );
        }
        if (maxSessions < count()) {
          throw failure(
            'form-capacity-in-use',
            'Close owned review sessions before reducing capacity.'
          );
        }
        const value = { maxSessions, revision: globalThis.crypto.randomUUID() };
        if (!store) {
          throw failure(
            'form-capacity-unavailable',
            'A store is required to save review capacity.'
          );
        }
        await store.put({
          id,
          tokens: ['config', 'form-review-capacity'],
          ...value,
        });
        await store.flush?.();
        current = value;
        return { ok: true, ...value };
      }),
  };
};
