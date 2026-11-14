import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { assignmentVacancy } from '../assignments/validation.js';
import { applicationResult, applicationStates } from './application-result.js';
import {
  applicationDraft,
  draftRestoration,
} from './application-draft-data.js';
import { applicationResumeUrl } from './application-location.js';
import {
  applicationSettings,
  applicationFailure as fail,
  applicationView,
} from './application-options.js';

const properties = [
  'requestId',
  'url',
  'browserSlot',
  'signature',
  'options',
  'revision',
  'state',
  'attempted',
  'delivery',
  'code',
  'vacancy',
  'resumeUrl',
  'draft',
  'restoration',
];
const snapshot = (record) =>
  Object.fromEntries(properties.map((key) => [key, record[key] ?? null]));
export const readApplicationJournal = (row, key) => {
  if (!row || row.version !== 1 || row.id !== key.id) {
    throw fail('missing');
  }
  const options = applicationSettings(row.options);
  if (
    options.id !== key.id ||
    options.url !== key.url ||
    options.browserSlot !== key.browserSlot ||
    JSON.stringify(options) !== row.signature ||
    row.requestId !== options.requestId ||
    row.url !== options.url ||
    row.browserSlot !== options.browserSlot ||
    !applicationStates.includes(row.state)
  ) {
    throw fail('journal');
  }
  if (row.vacancy) {
    if (row.vacancy.url !== row.url) {
      throw fail('journal');
    }
    assignmentVacancy(row.vacancy);
  }
  const restored = {
    ...row,
    resumeUrl: applicationResumeUrl(row.resumeUrl, key.url),
    draft: applicationDraft(row.draft),
    restoration: draftRestoration(row.restoration),
    active: false,
  };
  applicationResult(applicationView(restored), {
    ...key,
    requestId: row.requestId,
  });
  return globalThis.structuredClone(restored);
};
export const saveApplicationJournal = async (store, record) => {
  const next = globalThis.structuredClone({
    ...snapshot(record),
    revision: globalThis.crypto.randomUUID(),
    id: record.id,
    version: 1,
  });
  try {
    await saveAcknowledgedRecord(store, next);
    record.revision = next.revision;
    record.acknowledged = globalThis.structuredClone(next);
  } catch (error) {
    // A pre-dispatch refusal must not expose unacknowledged intent. Once dispatch
    // was reserved, that acknowledged reservation remains unknown across failure.
    if (record.acknowledged) {
      Object.assign(
        record,
        globalThis.structuredClone(snapshot(record.acknowledged))
      );
    }
    record.guard = null;
    throw error;
  }
};
