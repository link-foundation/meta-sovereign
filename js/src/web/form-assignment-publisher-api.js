import {
  assignmentTarget,
  assignmentVacancyReference,
  assignmentSourceUrl,
} from '../assignments/validation.js';
import { assignmentRepositoryConfirmed } from '../forms/assignment-repository.js';
import { assignmentFormUrl } from '../forms/assignment-recognition.js';
import {
  ASSIGNMENT_LANGUAGES,
  assignmentLanguageOverride,
} from '../assignments/templates.js';
import {
  PROVIDED_ASSIGNMENT_SCOPE,
  isLinkedAssignmentScope,
  providedAssignmentFingerprint,
} from '../assignments/source.js';
import { standaloneAssignmentId } from '../assignments/standalone.js';
import { checkAssignmentVacancyEvidence } from '../assignments/vacancy-evidence.js';

const unconfirmed = () =>
  Object.assign(new Error('The assignment result was not confirmed.'), {
    code: 'assignment-unconfirmed',
  });
const draftRefusals = new Map([
  ['assignment-review-changed', 'assignment.review-changed'],
  ['assignment-source-unreadable', 'assignment.instructions-unreadable'],
  ['assignment-source-unavailable', 'assignment.instructions-unavailable'],
  ['assignment-source-timeout', 'assignment.instructions-timeout'],
]);
export const assignmentDraftRefusalKey = (code) => draftRefusals.get(code);
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value);
const publicText = (value, limit) =>
  typeof value === 'string' && Boolean(value.trim()) && value.length <= limit;
const validSourceBinding = (evidence) =>
  typeof evidence?.capturedAt === 'string' &&
  evidence.capturedAt.length <= 40 &&
  Number.isFinite(Date.parse(evidence.capturedAt)) &&
  typeof evidence.fingerprint === 'string' &&
  /^[a-f\d]{64}$/u.test(evidence.fingerprint);
const validSource = async (evidence, { sourceUrl: url, sourceText: text }) => {
  if (text !== undefined) {
    return (
      validSourceBinding(evidence) &&
      evidence.scope === PROVIDED_ASSIGNMENT_SCOPE &&
      evidence.url === undefined &&
      evidence.requestedUrl === undefined &&
      evidence.fingerprint === (await providedAssignmentFingerprint(text))
    );
  }
  if (url === undefined) {
    return evidence === undefined;
  }
  return (
    validSourceBinding(evidence) &&
    evidence.requestedUrl === assignmentSourceUrl(url) &&
    evidence.url === assignmentSourceUrl(evidence.url) &&
    typeof evidence.title === 'string' &&
    evidence.title.length <= 500 &&
    isLinkedAssignmentScope(evidence.scope)
  );
};
const validLanguage = (draft, requested) =>
  Object.hasOwn(ASSIGNMENT_LANGUAGES, draft.language) &&
  draft.languageOverride === requested &&
  (requested === undefined || requested === draft.language);
const validDraftIdentity = async (draft, input) => {
  if (input.standalone === true) {
    return (
      draft.formUrl === undefined &&
      Boolean(draft.sourceEvidence) &&
      uuid(draft.assignmentRevision) &&
      draft.assignmentId === (await standaloneAssignmentId(input.target))
    );
  }
  return (
    draft.formUrl === assignmentFormUrl(input.inspection.url) &&
    draft.assignmentRevision === input.revision
  );
};
const validDraft = async (draft, input) =>
  draft?.target === input.target &&
  (await validDraftIdentity(draft, input)) &&
  (await validSource(draft.sourceEvidence, input)) &&
  validLanguage(draft, input.languageOverride) &&
  draft.visibility === input.visibility &&
  publicText(draft.title, 200) &&
  publicText(draft.body, 24000) &&
  ['live', 'fallback'].includes(draft.catalogSource) &&
  ['create', 'merge', 'keep'].includes(draft.templateAction);
const confirmVacancy = async (draft, requested) => {
  try {
    await checkAssignmentVacancyEvidence(draft);
  } catch {
    throw unconfirmed();
  }
  if (
    requested !== undefined &&
    (draft.vacancyEvidence.source !== 'url' ||
      draft.vacancyEvidence.url !== assignmentVacancyReference(requested))
  ) {
    throw unconfirmed();
  }
};
const confirmedDraft = async (result, input) => {
  const draft = result?.draft;
  if (
    result?.ok !== true ||
    result.state !== 'draft' ||
    !/^assignment-draft:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(
      draft?.id
    ) ||
    !(await validDraft(draft, input))
  ) {
    throw unconfirmed();
  }
  assignmentTarget(draft.template);
  assignmentTarget(draft.target);
  await confirmVacancy(draft, input.vacancyUrl);
  return result;
};
const requestDraft = async (report, action, input) => {
  const result = await report(`/api/forms/assignment/${action}`, input, {
    network: true,
  });
  if (result?.ok === false && assignmentDraftRefusalKey(result.code)) {
    throw Object.assign(unconfirmed(), { code: result.code });
  }
  return result;
};
export const draftFormAssignment = async (report, input) => {
  assignmentTarget(input.target);
  const request = {
    ...input,
    languageOverride: assignmentLanguageOverride(input.languageOverride),
  };
  return confirmedDraft(await requestDraft(report, 'draft', request), request);
};
export const restoreFormAssignment = async (report, input) => {
  const result = await requestDraft(report, 'restore', input);
  if (typeof result?.attempted !== 'boolean') {
    throw unconfirmed();
  }
  const target = result.draft?.target;
  if (
    input.standalone === true &&
    assignmentTarget(target).toLowerCase() !==
      assignmentTarget(input.target).toLowerCase()
  ) {
    throw unconfirmed();
  }
  return confirmedDraft(result, {
    ...input,
    target,
    visibility: result.draft?.visibility,
    sourceUrl: result.draft?.sourceEvidence?.requestedUrl,
    sourceText: result.sourceText,
    languageOverride: result.draft?.languageOverride,
  });
};
const validAssociation = (assignment, draft) =>
  assignment?.state === 'verified' &&
  assignment.id === draft.assignmentId &&
  assignment.formUrl === draft.formUrl &&
  uuid(assignment.revision) &&
  assignment.revision !== draft.assignmentRevision &&
  assignmentRepositoryConfirmed(assignment.repository, draft.target);
const validPublishedAssignment = (result, draft) =>
  draft.formUrl === undefined
    ? result.assignment === undefined
    : validAssociation(result.assignment, draft) &&
      result.assignment.repository.id === result.repository.id;
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
  const issue = result?.issue;
  if (
    result?.ok !== true ||
    result.state !== 'verified' ||
    !assignmentRepositoryConfirmed(result.repository, draft.target) ||
    !validPublishedAssignment(result, draft) ||
    !validIssue(issue, draft)
  ) {
    throw unconfirmed();
  }
  return result;
};
