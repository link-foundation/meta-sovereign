import { modelFingerprint } from '../automation/answer-model-context.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';
import {
  assignmentFailure,
  assignmentTarget,
  assignmentText,
} from './validation.js';
import { checkSavedAssignmentSource } from './source.js';
import { assignmentFormUrl } from '../forms/assignment-recognition.js';

export const assignmentWriteIssued = (record) =>
  Boolean(
    record &&
    ['repositoryIssued', 'seedIssued', 'issueIssued', 'issueUpdateIssued'].some(
      (key) => record[key] === true
    )
  );

export const assignmentPublicationId = async (assignmentId, target) =>
  `assignment-publication:${await modelFingerprint([assignmentId, target.toLowerCase()])}`;
export const assignmentIssueMarker = async (assignmentId, target) =>
  `<!-- meta-sovereign-assignment:${(await assignmentPublicationId(assignmentId, target)).split(':')[1]} -->`;
export const markedAssignmentIssue = (issues, marker) => {
  if (!Array.isArray(issues)) {
    throw assignmentFailure('readback', 'GitHub did not return an issue list.');
  }
  const matches = issues.filter(
    (issue) => typeof issue.body === 'string' && issue.body.includes(marker)
  );
  if (
    matches.some(
      (issue) =>
        !Number.isSafeInteger(issue.number) ||
        issue.number < 1 ||
        typeof issue.title !== 'string'
    )
  ) {
    throw assignmentFailure(
      'readback',
      'GitHub returned an invalid marked issue.'
    );
  }
  if (matches.length > 1) {
    throw assignmentFailure(
      'issue-ambiguous',
      'Several issues carry this assignment marker.'
    );
  }
  return matches[0] ?? null;
};
export const issueSnapshot = async (issue) =>
  issue
    ? {
        number: issue.number,
        fingerprint: await modelFingerprint([
          issue.number,
          issue.title,
          issue.body,
          issue.updated_at,
        ]),
      }
    : null;

const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value);
const validDraftBinding = (draft) =>
  /^form-assignment:[a-f\d]{64}$/u.test(draft.assignmentId) &&
  uuid(draft.assignmentRevision) &&
  uuid(draft.modelRevision) &&
  Number.isFinite(Date.parse(draft.createdAt)) &&
  assignmentFormUrl(draft.formUrl) === draft.formUrl &&
  ['private', 'public'].includes(draft.visibility) &&
  ['create', 'merge', 'keep'].includes(draft.templateAction) &&
  (draft.repositoryId === null ||
    (Number.isSafeInteger(draft.repositoryId) && draft.repositoryId > 0));
export const readAssignmentDraft = async (store, id) => {
  if (
    typeof id !== 'string' ||
    !/^assignment-draft:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(id)
  ) {
    throw assignmentFailure('draft', 'Use a saved assignment draft.');
  }
  const record = await store.get(id);
  if (
    record?.version !== 1 ||
    record.draft?.id !== id ||
    !Array.isArray(record.employers) ||
    record.employers.length > 23 ||
    !validDraftBinding(record.draft)
  ) {
    throw assignmentFailure(
      'draft',
      'The saved assignment draft is unavailable.'
    );
  }
  await checkSavedAssignmentSource(record);
  assignmentTarget(record.draft.target);
  assignmentTarget(record.draft.template);
  assignmentText(record.draft.title, 200, 'saved issue title');
  assignmentText(record.draft.body, 24000, 'saved issue body');
  record.employers.forEach((name) =>
    assignmentText(name, 500, 'saved employer alias')
  );
  return record;
};
export const writePublication = (store, id, change) =>
  writeAnswerKnowledge(store, async () => {
    const previous = await store.get(id);
    if (previous && (previous.version !== 1 || previous.id !== id)) {
      throw assignmentFailure('record', 'The publication receipt is invalid.');
    }
    const record = {
      id,
      version: 1,
      tokens: ['assignment', 'publication'],
      children: [],
      ...previous,
      ...change(previous),
    };
    await store.put(record);
    await store.flush?.();
    return record;
  });
