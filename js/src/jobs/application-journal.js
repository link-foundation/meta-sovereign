import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { assignmentVacancy } from '../assignments/validation.js';
import { applicationResult, applicationStates } from './application-result.js';
import {
  applicationDraft,
  draftRestoration,
} from './application-draft-data.js';
import { applicationResumeUrl } from './application-location.js';
import { applicationPopupCheckpoint } from './application-popup.js';
import { applicationResumePreference } from './application-resume-preference.js';
import { applicationLetterTemplate } from './application-letters.js';
import { applicationLimitRejection } from './application-limit-rejection-data.js';
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
  'popupReview',
  'resumePreference',
  'letterTemplate',
  'attachmentDelivery',
  'attachmentObserved',
  'limitRejection',
  'draft',
  'restoration',
];
const snapshot = (record) =>
  Object.fromEntries(properties.map((key) => [key, record[key] ?? null]));
const validAttachment = ({
  attachmentDelivery,
  attachmentObserved,
  delivery,
}) =>
  ((attachmentDelivery ?? null) === null ||
    (['unknown', 'provider-confirmed'].includes(attachmentDelivery) &&
      delivery === 'provider-confirmed')) &&
  ((attachmentObserved ?? null) === null ||
    (attachmentObserved === true && delivery === 'provider-confirmed'));
export const readApplicationJournal = (row, key) => {
  if (!row || row.version !== 1 || row.id !== key.id) {
    throw fail('missing');
  }
  const options = applicationSettings(row.options, { legacy: true });
  if (
    options.id !== key.id ||
    options.url !== key.url ||
    options.browserSlot !== key.browserSlot ||
    JSON.stringify(options) !== row.signature ||
    row.requestId !== options.requestId ||
    row.url !== options.url ||
    row.browserSlot !== options.browserSlot ||
    !applicationStates.includes(row.state) ||
    !validAttachment(row)
  ) {
    throw fail('journal');
  }
  if (row.vacancy) {
    if (options.collectVacancies === false) {
      throw fail('journal');
    }
    if (row.vacancy.url !== row.url) {
      throw fail('journal');
    }
    assignmentVacancy(row.vacancy);
  }
  const restored = {
    ...row,
    resumeUrl: applicationResumeUrl(row.resumeUrl, key.url),
    popupReview: applicationPopupCheckpoint(row.popupReview, row),
    resumePreference: applicationResumePreference(row.resumePreference),
    letterTemplate: applicationLetterTemplate(row.letterTemplate, options),
    limitRejection: applicationLimitRejection(row.limitRejection),
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
    ...(record.options.collectVacancies === false ? { vacancy: null } : {}),
    revision: globalThis.crypto.randomUUID(),
    id: record.id,
    version: 1,
  });
  try {
    await saveAcknowledgedRecord(store, next);
    record.revision = next.revision;
    // Rollback needs the acknowledged live context; it must never reach disk
    // when collection is disabled, including during a later failed save.
    record.acknowledged = globalThis.structuredClone({
      ...next,
      vacancy: record.vacancy ?? null,
    });
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
