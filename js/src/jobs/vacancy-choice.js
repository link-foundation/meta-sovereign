import { browserName } from '../browser/policy.js';
import {
  assignmentText,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { jobsFailure, jobsObject } from './options.js';

export const vacancyChoiceFailure = (kind = 'input') =>
  jobsFailure(`choice-${kind}`, 'The local vacancy choice was not confirmed.');
export const vacancyChoiceSlot = (input = {}) => {
  jobsObject(input);
  return browserName(input.browserSlot ?? 'jobs');
};
export const vacancyChoiceId = (slot) =>
  `secret:jobs-vacancy-choices:${browserName(slot)}`;
const revision = (value) => {
  if (
    typeof value !== 'string' ||
    (value !== 'empty' &&
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value))
  ) {
    throw vacancyChoiceFailure();
  }
  return value;
};
export const vacancyChoiceEntry = (raw) => {
  jobsObject(raw);
  if (
    !['skipped', 'deferred'].includes(raw.state) ||
    typeof raw.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.updatedAt))
  ) {
    throw vacancyChoiceFailure();
  }
  return {
    url: assignmentVacancyUrl(raw.url),
    title: assignmentText(raw.title, 500, 'vacancy title'),
    state: raw.state,
    note: assignmentText(raw.note ?? '', 4000, 'private vacancy note', true),
    updatedAt: raw.updatedAt,
  };
};
/** Portable owner choices. No provider outcome is inferred from these records. */
export const vacancyChoiceResult = (raw, input = {}) => {
  const slot = vacancyChoiceSlot(input);
  if (
    !raw ||
    raw.version !== 1 ||
    raw.browserSlot !== slot ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 1000
  ) {
    throw vacancyChoiceFailure('state');
  }
  const entries = raw.entries.map(vacancyChoiceEntry);
  if (
    entries.reduce(
      (size, row) => size + row.url.length + row.title.length + row.note.length,
      0
    ) > 1000000
  ) {
    throw vacancyChoiceFailure('capacity');
  }
  if (
    new Set(entries.map((row) => row.url)).size !== entries.length ||
    (raw.revision === 'empty' && entries.length)
  ) {
    throw vacancyChoiceFailure('state');
  }
  return {
    version: 1,
    browserSlot: slot,
    revision: revision(raw.revision),
    entries,
  };
};
export const vacancyChoiceInput = (input) => {
  const browserSlot = vacancyChoiceSlot(input);
  return {
    browserSlot,
    revision: revision(input.revision),
    url: assignmentVacancyUrl(input.url),
  };
};
