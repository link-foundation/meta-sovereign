import { currentAssignmentForDraft } from './draft.js';
import {
  assignmentPublicationId,
  readAssignmentDraft,
  assignmentWriteIssued,
} from './records.js';
import { assignmentFailure } from './validation.js';

/** Recover a private draft after page reload without invoking a model or GitHub. */
export const restoreAssignmentDraft = async ({ store, signal }, input) => {
  const { assignment } = await currentAssignmentForDraft(store, input);
  let selected;
  let attempted = false;
  const consume = async (rows) => {
    for (const row of rows) {
      const ledger = await store.get(
        await assignmentPublicationId(assignment.id, row.draft.target)
      );
      const pending =
        ledger?.draftId === row.id &&
        ledger.stage !== 'verified' &&
        assignmentWriteIssued(ledger);
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
