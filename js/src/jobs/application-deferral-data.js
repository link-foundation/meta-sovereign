import { vacancyChoiceSlot } from './vacancy-choice.js';
import {
  applicationKey,
  applicationFailure as fail,
} from './application-options.js';

const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value);

const validEntry = (row, slot, key) =>
  uuid(row.id) &&
  row.browserSlot === slot &&
  key.url === row.url &&
  row.reason === 'questionnaire' &&
  typeof row.requestId === 'string' &&
  /^[a-zA-Z0-9_-]{1,100}$/u.test(row.requestId) &&
  typeof row.title === 'string' &&
  row.title.length <= 500 &&
  typeof row.queuedAt === 'string' &&
  Number.isFinite(Date.parse(row.queuedAt));

/** Queue receipts contain identities only. Answers remain in private storage. */
export const applicationQueueResult = (raw, input = {}) => {
  const slot = vacancyChoiceSlot(input);
  if (
    raw?.ok !== true ||
    raw.mode !== 'hh-application-queue' ||
    raw.browserSlot !== slot ||
    !uuid(raw.revision) ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 1000
  ) {
    throw fail('queue');
  }
  const seen = new Set();
  const vacancies = new Set();
  for (const row of raw.entries) {
    const key = applicationKey(row);
    if (
      !validEntry(row, slot, key) ||
      seen.has(row.id) ||
      vacancies.has(key.id)
    ) {
      throw fail('queue');
    }
    seen.add(row.id);
    vacancies.add(key.id);
  }
  return raw;
};
