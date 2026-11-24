import { currentAssignmentForDraft } from './draft.js';
import {
  assignmentPublicationId,
  readAssignmentDraft,
  assignmentWriteIssued,
} from './records.js';
import { assignmentFailure } from './validation.js';
import { PROVIDED_ASSIGNMENT_SCOPE } from './source.js';
import {
  standaloneAssignment,
  standaloneDraftSelection,
} from './standalone.js';

const attemptedPublication = (ledger, draftId) =>
  ledger?.draftId === draftId &&
  ledger.stage !== 'verified' &&
  assignmentWriteIssued(ledger);

const restoreStandalone = async (store, signal, assignment) => {
  const selection = await standaloneDraftSelection(store, assignment.id);
  if (!selection) {
    throw assignmentFailure(
      'draft-missing',
      'There is no saved standalone draft for this target.'
    );
  }
  const { draft, source } = await readAssignmentDraft(store, selection.draftId);
  if (draft.assignmentId !== assignment.id || draft.formUrl !== undefined) {
    throw assignmentFailure(
      'draft',
      'The saved draft belongs to a different assignment.'
    );
  }
  const ledger = await store.get(
    await assignmentPublicationId(draft.assignmentId, draft.target)
  );
  signal.throwIfAborted();
  return {
    ok: true,
    state: 'draft',
    draft,
    attempted: attemptedPublication(ledger, draft.id),
    ...(source.scope === PROVIDED_ASSIGNMENT_SCOPE
      ? { sourceText: source.text }
      : {}),
  };
};

/** Recover a private draft after page reload without invoking a model or GitHub. */
export const restoreAssignmentDraft = async ({ store, signal }, input) => {
  const standalone = await standaloneAssignment(input);
  if (standalone) {
    return restoreStandalone(store, signal, standalone);
  }
  const { assignment } = await currentAssignmentForDraft(store, input);
  let selected;
  let attempted = false;
  const consume = async (rows) => {
    for (const row of rows) {
      const ledger = await store.get(
        await assignmentPublicationId(assignment.id, row.draft.target)
      );
      const pending = attemptedPublication(ledger, row.id);
      if (
        !selected ||
        (pending && !attempted) ||
        (pending === attempted &&
          row.draft.createdAt > selected.draft.createdAt)
      ) {
        selected = row;
        attempted = pending;
      }
    }
  };
  const filter = (row) =>
    row.id?.startsWith('assignment-draft:') &&
    row.draft?.assignmentId === assignment.id &&
    row.draft.assignmentRevision === assignment.revision &&
    Number.isFinite(Date.parse(row.draft.createdAt));
  if (typeof store.scan === 'function') {
    await store.scan(filter, 16, consume);
  } else {
    await consume(await store.query(filter));
  }
  signal.throwIfAborted();
  if (!selected) {
    throw assignmentFailure(
      'draft-missing',
      'There is no saved draft for this assignment revision.'
    );
  }
  const { draft } = await readAssignmentDraft(store, selected.id);
  return { ok: true, state: 'draft', draft, attempted };
};
