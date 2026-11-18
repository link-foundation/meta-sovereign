import {
  questionKey,
  MAX_QUESTION_LENGTH,
} from '../automation/question-match.js';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import { vacancySkipRevision } from './vacancy-skip-data.js';
import { jobsFailure } from './options.js';

export const deferredQuestionFailure = (kind = 'state') =>
  jobsFailure(
    `question-deferral-${kind}`,
    'The saved question policy was not confirmed.'
  );
export const deferredQuestionId = (slot) =>
  `secret:jobs-deferred-questions:${vacancyChoiceSlot({ browserSlot: slot })}`;
export const deferredQuestionText = (question) => {
  if (
    typeof question !== 'string' ||
    question.length > MAX_QUESTION_LENGTH ||
    !questionKey(question)
  ) {
    throw deferredQuestionFailure('input');
  }
  return question.trim();
};
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value);
export const deferredQuestionResult = (raw, input = {}) => {
  const browserSlot = vacancyChoiceSlot(input);
  if (
    raw?.version !== 1 ||
    raw.browserSlot !== browserSlot ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 128
  ) {
    throw deferredQuestionFailure();
  }
  const revision = vacancySkipRevision(raw.revision, browserSlot);
  const entries = raw.entries.map((row) => {
    if (
      !uuid(row.id) ||
      !['always', 'until-answered'].includes(row.mode) ||
      !Array.isArray(row.vacancies) ||
      row.vacancies.length > 1000 ||
      typeof row.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(row.createdAt))
    ) {
      throw deferredQuestionFailure();
    }
    const vacancies = row.vacancies.map(assignmentVacancyUrl);
    if (new Set(vacancies).size !== vacancies.length) {
      throw deferredQuestionFailure();
    }
    return {
      id: row.id,
      question: deferredQuestionText(row.question),
      mode: row.mode,
      vacancies,
      createdAt: row.createdAt,
    };
  });
  if (
    (revision === 'empty' && entries.length) ||
    entries.reduce((count, row) => count + row.vacancies.length, 0) > 1000 ||
    new Set(entries.map((row) => questionKey(row.question))).size !==
      entries.length ||
    new Set(entries.map((row) => row.id)).size !== entries.length ||
    JSON.stringify(entries).length > 2000000
  ) {
    throw deferredQuestionFailure();
  }
  return { version: 1, browserSlot, revision, entries };
};
export const deferredQuestionChange = (input) => {
  const browserSlot = vacancyChoiceSlot(input);
  const revision = vacancySkipRevision(input.revision, browserSlot);
  if (input.action === 'remove' && uuid(input.entryId)) {
    return { browserSlot, revision, action: 'remove', entryId: input.entryId };
  }
  if (
    input.action !== 'save' ||
    !['always', 'until-answered'].includes(input.mode)
  ) {
    throw deferredQuestionFailure('input');
  }
  return {
    browserSlot,
    revision,
    action: 'save',
    question: deferredQuestionText(input.question),
    mode: input.mode,
  };
};
