import { assignmentPublicationId } from '../assignments/records.js';
import {
  assignmentIssueConfirmed,
  assignmentRepositoryConfirmed,
} from './assignment-repository.js';

const matchingPublication = (receipt, association, name) =>
  receipt?.state === 'verified' &&
  receipt.ok === true &&
  receipt.assignment?.id === association.id &&
  receipt.assignment.formUrl === association.formUrl &&
  receipt.assignment.revision === association.revision &&
  assignmentRepositoryConfirmed(receipt.repository, name) &&
  receipt.repository.id === association.repository.id &&
  assignmentIssueConfirmed(receipt.issue, name);

/** Recover the issue from the existing publication ledger for this exact form. */
export const formAssignmentIssue = async (store, association) => {
  const repository = association?.repository;
  if (!repository) {
    return undefined;
  }
  const name = repository.fullName;
  const id = await assignmentPublicationId(association.id, name);
  const ledger = await store.get(id);
  const receipt = ledger?.result;
  if (
    ledger?.id !== id ||
    ledger.version !== 1 ||
    ledger.stage !== 'verified' ||
    !/^assignment-draft:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(
      ledger.draftId
    ) ||
    receipt?.draftId !== ledger.draftId ||
    !matchingPublication(receipt, association, name)
  ) {
    return undefined;
  }
  return { number: receipt.issue.number, url: receipt.issue.url };
};
