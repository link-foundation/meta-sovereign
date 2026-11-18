import {
  assignmentSourceUrl,
  assignmentText,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { vacancyChoiceResult, vacancyChoiceSlot } from './vacancy-choice.js';
import { jobsFailure, jobsObject } from './options.js';
import { vacancySkipPrefillCommand } from './vacancy-skip-command.js';

export const vacancySkipReasons = ['external_site', 'resume_not_visible'];
export const vacancySkipFailure = (kind = 'state') =>
  jobsFailure(
    `skip-${kind}`,
    'The private vacancy skip record was not confirmed.'
  );
export const vacancySkipId = (slot) =>
  `secret:jobs-vacancy-skips:${vacancyChoiceSlot({ browserSlot: slot })}`;
export const vacancySkipRevision = (revision, browserSlot) =>
  vacancyChoiceResult(
    {
      version: 1,
      browserSlot,
      revision,
      entries: [],
    },
    { browserSlot }
  ).revision;

export const vacancySkipEntry = (raw) => {
  jobsObject(raw);
  if (
    !vacancySkipReasons.includes(raw.reason) ||
    typeof raw.time !== 'string' ||
    !Number.isFinite(Date.parse(raw.time)) ||
    !Number.isSafeInteger(raw.attempts) ||
    raw.attempts < 1 ||
    typeof raw.requestId !== 'string' ||
    !/^[a-zA-Z\d_-]{1,100}$/u.test(raw.requestId)
  ) {
    throw vacancySkipFailure();
  }
  return {
    url: assignmentVacancyUrl(raw.url),
    title: assignmentText(raw.title, 500, 'vacancy title', true),
    reason: raw.reason,
    externalUrl:
      raw.externalUrl === null ? null : assignmentSourceUrl(raw.externalUrl),
    time: raw.time,
    attempts: raw.attempts,
    requestId: raw.requestId,
    prefillCommand: vacancySkipPrefillCommand(raw),
  };
};

/** Provider observations are separate from the owner's manual vacancy choices. */
export const vacancySkipResult = (raw, input = {}) => {
  const browserSlot = vacancyChoiceSlot(input);
  if (
    !raw ||
    raw.version !== 1 ||
    raw.browserSlot !== browserSlot ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 1000
  ) {
    throw vacancySkipFailure();
  }
  const revision = vacancySkipRevision(raw.revision, browserSlot);
  const entries = raw.entries.map(vacancySkipEntry);
  if (
    new Set(entries.map((row) => row.url)).size !== entries.length ||
    (revision === 'empty' && entries.length) ||
    JSON.stringify(entries).length > 2000000
  ) {
    throw vacancySkipFailure();
  }
  return { version: 1, browserSlot, revision, entries };
};

export const vacancySkipClearInput = (input) => {
  const browserSlot = vacancyChoiceSlot(input);
  const revision = vacancySkipRevision(input.revision, browserSlot);
  if (
    (input.url === undefined) === (input.reason === undefined) ||
    (input.reason !== undefined && !vacancySkipReasons.includes(input.reason))
  ) {
    throw vacancySkipFailure('input');
  }
  return {
    browserSlot,
    revision,
    ...(input.url === undefined
      ? { reason: input.reason }
      : { url: assignmentVacancyUrl(input.url) }),
  };
};
