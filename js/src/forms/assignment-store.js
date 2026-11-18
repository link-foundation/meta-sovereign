import { writeAnswerKnowledge } from '../automation/question-knowledge.js';
import { debugQuestionTurn } from '../automation/question-turns.js';
import {
  assignmentFormUrl,
  assignmentRecordId,
  recognizeFormAssignment,
} from './assignment-recognition.js';
import { formFailure } from './options.js';
import {
  assignmentRepositoryName,
  assignmentRepositoryConfirmed,
} from './assignment-repository.js';

const validRepository = (repository) =>
  repository === null ||
  (Boolean(repository) &&
    assignmentRepositoryConfirmed(
      repository,
      assignmentRepositoryName(repository.url)
    ));

export const assignmentState = (record) => {
  if (!record) {
    return null;
  }
  const repository = record.repository;
  if (
    record.version !== 1 ||
    !/^form-assignment:[a-f\d]{64}$/u.test(record.id) ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(record.revision) ||
    typeof record.description !== 'string' ||
    record.description.length > 30000 ||
    (record.fingerprint !== null &&
      !/^[a-f\d]{64}$/u.test(record.fingerprint)) ||
    assignmentFormUrl(record.formUrl) !== record.formUrl ||
    !validRepository(repository)
  ) {
    throw formFailure(
      'form-assignment-invalid',
      'The saved assignment association is invalid.'
    );
  }
  return {
    id: record.id,
    revision: record.revision,
    formUrl: record.formUrl,
    state: record.repository ? 'verified' : 'needs-repository',
    repository: record.repository ?? null,
  };
};

export const storedFormAssignment = async (store, url) => {
  const record = await store.get(await assignmentRecordId(url));
  const state = assignmentState(record);
  if (state && state.formUrl !== assignmentFormUrl(url)) {
    throw formFailure(
      'form-assignment-invalid',
      'The saved assignment belongs to another form.'
    );
  }
  return record;
};
export const currentFormAssignment = async (store, inspection) =>
  assignmentState(await storedFormAssignment(store, inspection.url));

/** The private hold is metadata, separate from the read-only answer proposal. */
export const rememberFormAssignment = async (store, inspection) => {
  const found = await recognizeFormAssignment(inspection);
  const id = await assignmentRecordId(inspection.url);
  return writeAnswerKnowledge(store, async () => {
    const previous = await storedFormAssignment(store, inspection.url);
    // Later pages may have no task description. Keep the original hold/link.
    if (
      !found ||
      (previous &&
        (!found.fingerprint || previous.fingerprint === found.fingerprint))
    ) {
      return assignmentState(previous);
    }
    const record = {
      id,
      tokens: ['forms', 'assignment'],
      children: [],
      version: 1,
      formUrl: assignmentFormUrl(inspection.url),
      description: found.description,
      fingerprint: found.fingerprint,
      revision: globalThis.crypto.randomUUID(),
      repository: null,
    };
    await store.put(record);
    await store.flush?.();
    debugQuestionTurn('form-assignment-hold', {
      changed: Boolean(previous),
      resultFields: found.resultFields.length,
    });
    return assignmentState(record);
  });
};
