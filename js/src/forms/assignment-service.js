import { validateFormInspection } from './plan-validation.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';
import { formFailure } from './options.js';
import { assignmentState, storedFormAssignment } from './assignment-store.js';
import { recognizeFormAssignment } from './assignment-recognition.js';
import { verifyAssignmentRepository } from './assignment-github.js';
import {
  assignmentRepositoryName,
  assignmentRepositoryReceipt,
} from './assignment-repository.js';

/** A read-only GitHub check followed by a revision-bound local association. */
export const createAssignmentRepositoryService = ({
  store,
  verifyRepository = verifyAssignmentRepository,
  now = () => Date.now(),
}) => {
  let active;
  let stopping = false;
  const register = async (input, signal) => {
    const inspection = validateFormInspection(input.inspection);
    const name = assignmentRepositoryName(input.repository);
    const saved = await storedFormAssignment(store, inspection.url);
    const recognized = await recognizeFormAssignment(inspection);
    if (
      !saved ||
      saved.revision !== input.revision ||
      (recognized?.fingerprint && recognized.fingerprint !== saved.fingerprint)
    ) {
      throw formFailure(
        'form-assignment-changed',
        'Plan the current assignment again before linking a repository.'
      );
    }
    const result = await verifyRepository(name, { signal });
    signal.throwIfAborted();
    const repository = assignmentRepositoryReceipt(result, name, now);
    return writeAnswerKnowledge(store, async () => {
      signal.throwIfAborted();
      const current = await storedFormAssignment(store, inspection.url);
      if (current?.revision !== saved.revision) {
        throw formFailure(
          'form-assignment-changed',
          'The assignment changed while its repository was checked.'
        );
      }
      const next = {
        ...current,
        revision: globalThis.crypto.randomUUID(),
        repository,
      };
      await store.put(next);
      await store.flush?.();
      return { ok: true, assignment: assignmentState(next) };
    });
  };
  return {
    register: async (input) => {
      if (stopping || active) {
        throw formFailure(
          stopping ? 'form-stopped' : 'form-busy',
          'Assignment repository verification is unavailable while another operation is active.'
        );
      }
      const controller = new AbortController();
      const task = register(input, controller.signal);
      active = { controller, task };
      try {
        return await task;
      } finally {
        active = null;
      }
    },
    stop: async () => {
      stopping = true;
      const owned = active;
      owned?.controller.abort();
      await owned?.task.catch(() => {});
    },
  };
};
