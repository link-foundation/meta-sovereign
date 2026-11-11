import {
  assignmentTarget,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { assignmentRepositoryConfirmed } from '../forms/assignment-repository.js';
import { assignmentFormUrl } from '../forms/assignment-recognition.js';

const unconfirmed = () =>
  Object.assign(new Error('The assignment result was not confirmed.'), {
    code: 'assignment-unconfirmed',
  });
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value);
const publicText = (value, limit) =>
  typeof value === 'string' && Boolean(value.trim()) && value.length <= limit;
const validDraft = (draft, input) => {
  if (
    draft?.vacancyEvidence?.url &&
    assignmentVacancyUrl(draft.vacancyEvidence.url) !==
      draft.vacancyEvidence.url
  ) {
    return false;
  }
  return (
    draft?.target === input.target &&
    draft.visibility === input.visibility &&
    draft.formUrl === assignmentFormUrl(input.inspection.url) &&
    draft.assignmentRevision === input.revision &&
    publicText(draft.title, 200) &&
    publicText(draft.body, 24000) &&
    ['live', 'fallback'].includes(draft.catalogSource) &&
    ['create', 'merge', 'keep'].includes(draft.templateAction)
  );
};
const confirmedDraft = (result, input) => {
  const draft = result?.draft;
  if (
    result?.ok !== true ||
    result.state !== 'draft' ||
    !/^assignment-draft:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(
      draft?.id
    ) ||
    !validDraft(draft, input)
  ) {
    throw unconfirmed();
  }
  assignmentTarget(draft.template);
  assignmentTarget(draft.target);
  return result;
};
export const draftFormAssignment = async (report, input) => {
  assignmentTarget(input.target);
  return confirmedDraft(
    await report('/api/forms/assignment/draft', input, { network: true }),
    input
  );
};
export const restoreFormAssignment = async (report, input) => {
  const result = await report('/api/forms/assignment/restore', input, {
    network: true,
  });
  if (typeof result?.attempted !== 'boolean') {
    throw unconfirmed();
  }
  return confirmedDraft(result, {
    ...input,
    target: result.draft?.target,
    visibility: result.draft?.visibility,
  });
};
const validAssociation = (assignment, draft) =>
  assignment?.state === 'verified' &&
  assignment.id === draft.assignmentId &&
  assignment.formUrl === draft.formUrl &&
  uuid(assignment.revision) &&
  assignment.revision !== draft.assignmentRevision &&
  assignmentRepositoryConfirmed(assignment.repository, draft.target);
const validIssue = (issue, draft) =>
  Number.isSafeInteger(issue?.number) &&
  issue.number > 0 &&
  issue.url === `https://github.com/${draft.target}/issues/${issue.number}`;
export const publishFormAssignment = async (report, draft) => {
  const result = await report(
    '/api/forms/assignment/publish',
    { draftId: draft.id },
    { network: true }
  );
  if (result?.draftId !== draft.id) {
    throw unconfirmed();
  }
  if (
    result.ok === false &&
    result.state === 'uncertain' &&
    typeof result.code === 'string'
  ) {
    return result;
  }
  const assignment = result?.assignment;
  const issue = result?.issue;
  if (
    result?.ok !== true ||
    result.state !== 'verified' ||
    !assignmentRepositoryConfirmed(result.repository, draft.target) ||
    !validAssociation(assignment, draft) ||
    assignment.repository.id !== result.repository.id ||
    !validIssue(issue, draft)
  ) {
    throw unconfirmed();
  }
  return result;
};
