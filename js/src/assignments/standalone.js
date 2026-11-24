import { modelFingerprint } from '../automation/answer-model-context.js';
import { assignmentFailure, assignmentTarget } from './validation.js';

export const standaloneAssignmentId = async (target) =>
  `standalone-assignment:${await modelFingerprint(assignmentTarget(target).toLowerCase())}`;

export const standaloneAssignment = async (input) => {
  if (input.standalone !== true) {
    if (input.standalone !== undefined) {
      throw assignmentFailure(
        'input',
        'Use standalone: true to select standalone instructions.'
      );
    }
    return null;
  }
  if (input.inspection !== undefined || input.revision !== undefined) {
    throw assignmentFailure(
      'input',
      'Choose standalone instructions or a form inspection.'
    );
  }
  return {
    id: await standaloneAssignmentId(input.target),
    revision: globalThis.crypto.randomUUID(),
    description: '',
  };
};

export const standaloneDraftSelection = async (store, id) => {
  const record = await store.get(id);
  if (
    record &&
    (record.version !== 1 ||
      record.id !== id ||
      typeof record.draftId !== 'string')
  ) {
    throw assignmentFailure(
      'draft',
      'The saved standalone assignment selection is invalid.'
    );
  }
  return record;
};

export const assertStandaloneSelection = async (store, draft) => {
  const selection = await standaloneDraftSelection(store, draft.assignmentId);
  if (selection?.draftId !== draft.id) {
    throw assignmentFailure(
      'changed',
      'Restore or review the latest draft for this target.'
    );
  }
};

export const saveStandaloneSelection = (store, draft) =>
  store.put({
    id: draft.assignmentId,
    version: 1,
    tokens: ['assignment', 'standalone'],
    children: [],
    draftId: draft.id,
  });
