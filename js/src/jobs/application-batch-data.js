import {
  applicationSettings,
  applicationFailure as fail,
} from './application-options.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import { applicationResult } from './application-result.js';
import { applicationConfirmationPolicy } from './application-confirmations.js';
import { applicationAnswerContext } from './application-answer-context.js';
import { browserUnreadId } from '../automation/question-unread-identity.js';
import {
  applicationChatSettings,
  applicationChatView,
  validApplicationChatView,
} from './application-chat-settings.js';

export const applicationBatchKey = (input) => {
  const browserSlot = vacancyChoiceSlot(input);
  if (
    typeof input.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/u.test(input.requestId)
  ) {
    throw fail('batch-input');
  }
  return {
    browserSlot,
    requestId: input.requestId,
    id: `secret:jobs-application-batch:${browserSlot}:${input.requestId}`,
  };
};
const integer = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
const validateOptions = (input) => {
  if (
    !Array.isArray(input.urls) ||
    !input.urls.length ||
    input.urls.length > 1000 ||
    !integer(input.maxApplications ?? 0, 1000) ||
    input.formUrl !== undefined ||
    !integer(input.durationMs ?? 86400000, 86400000) ||
    (input.durationMs ?? 86400000) < 1000 ||
    (input.noQuestionnaires !== undefined &&
      typeof input.noQuestionnaires !== 'boolean')
  ) {
    throw fail('batch-input');
  }
};
export const applicationBatchOptions = (input) => {
  const key = applicationBatchKey(input);
  validateOptions(input);
  const urls = input.urls.map(assignmentVacancyUrl);
  if (new Set(urls).size !== urls.length) {
    throw fail('batch-input');
  }
  const {
    id: _id,
    url: _url,
    ...review
  } = applicationSettings({
    ...input,
    url: urls[0],
    applicationIntervalSeconds: input.applicationIntervalSeconds ?? 0,
  });
  return {
    ...key,
    review,
    urls,
    maxApplications: input.supervised ? 1 : (input.maxApplications ?? 0),
    durationMs: input.durationMs ?? 86400000,
    noQuestionnaires: input.noQuestionnaires === true,
    ...applicationChatSettings(input, key.browserSlot),
  };
};
export const applicationBatchPhases = [
  'starting',
  'pacing',
  'review',
  'questionnaires-held',
  'retry-wait',
  'daily-limit',
  'paused',
  'completed',
  'stopped',
  'expired',
  'refused',
  'interrupted',
];
export const applicationBatchTerminal = (phase) =>
  ['completed', 'stopped', 'expired', 'refused', 'interrupted'].includes(phase);

const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value);
const timestamp = (value) =>
  typeof value === 'string' && new Date(Date.parse(value)).toJSON() === value;
const lifecycle = (row) =>
  applicationBatchPhases.includes(row.phase) &&
  typeof row.active === 'boolean' &&
  row.active !== applicationBatchTerminal(row.phase) &&
  uuid(row.revision) &&
  timestamp(row.startedAt) &&
  timestamp(row.expiresAt) &&
  Date.parse(row.expiresAt) > Date.parse(row.startedAt) &&
  Date.parse(row.expiresAt) - Date.parse(row.startedAt) <= 86400000 &&
  (row.nextAt === null || timestamp(row.nextAt)) &&
  (row.code === null ||
    (typeof row.code === 'string' && /^[a-zA-Z0-9_-]{1,120}$/u.test(row.code)));
const members = (values, urls) =>
  Array.isArray(values) &&
  new Set(values).size === values.length &&
  values.every((url) => urls.includes(url));
const validLists = (raw, options) =>
  integer(raw.cursor, options.urls.length) &&
  members(raw.delivered, options.urls) &&
  members(raw.skipped, options.urls) &&
  !raw.delivered.some((url) => raw.skipped.includes(url)) &&
  (raw.currentUrl === null || options.urls.includes(raw.currentUrl));

const validChatSnapshot = (raw, options) =>
  (!options.processChats || browserUnreadId(raw.chatPassId)) &&
  (raw.chatWorker === undefined ||
    (options.processChats &&
      !raw.chatWorker.active &&
      validApplicationChatView(raw.chatWorker, options, false) &&
      raw.chatWorker.passId === raw.chatPassId));

/** Private snapshots are validated before recovery; they never recreate a worker. */
export const readApplicationBatch = (raw, key) => {
  const options = applicationBatchOptions({
    ...raw?.options,
    ...raw?.options?.review,
  });
  if (
    !raw ||
    raw.id !== key.id ||
    options.id !== key.id ||
    raw.version !== 1 ||
    raw.signature !== JSON.stringify(options) ||
    !lifecycle(raw) ||
    !validLists(raw, options) ||
    !validChatSnapshot(raw, options) ||
    Date.parse(raw.expiresAt) - Date.parse(raw.startedAt) !== options.durationMs
  ) {
    throw fail('batch-recovery');
  }
  return { ...raw, options };
};
const settingsView = (options) => ({
  ...applicationChatSettings(options, options.browserSlot),
  ...(options.review.autoAnswerViewedVacancy === undefined
    ? {}
    : { autoAnswerViewedVacancy: options.review.autoAnswerViewedVacancy }),
  confirmations: applicationConfirmationPolicy(options.review),
  applicationIntervalSeconds: options.review.applicationIntervalSeconds,
  supervised: options.review.supervised === true,
  testMode: options.review.testMode,
  autoExact: options.review.autoExact,
  reviewDelayMs: options.review.reviewDelayMs,
  ...applicationAnswerContext(options.review),
});
export const applicationBatchView = (
  record,
  active,
  application = null,
  modes = { paused: false, noQuestionnaires: false },
  runtime = null
) => ({
  ok: true,
  mode: 'hh-application-batch',
  batch: record
    ? {
        requestId: record.options.requestId,
        browserSlot: record.options.browserSlot,
        revision: record.revision,
        settings: settingsView(record.options),
        ...modes,
        phase: record.active && !active ? 'interrupted' : record.phase,
        active: Boolean(record.active && active),
        cursor: record.cursor,
        total: record.options.urls.length,
        delivered: record.delivered.length,
        skipped: record.skipped.length,
        maxApplications: record.options.maxApplications,
        currentUrl: record.currentUrl,
        startedAt: record.startedAt,
        expiresAt: record.expiresAt,
        nextAt: record.nextAt,
        code: record.code,
        ...(record.options.processChats
          ? { chatWorker: applicationChatView(record, runtime) }
          : {}),
      }
    : null,
  application,
});
const publicCounts = (row) =>
  integer(row.total, 1000) &&
  row.total > 0 &&
  integer(row.cursor, row.total) &&
  integer(row.delivered, row.total) &&
  integer(row.skipped, row.total - row.delivered) &&
  integer(row.maxApplications, 1000);
const publicSettings = (settings, browserSlot) => {
  if (!settings) {
    return false;
  }
  const options = applicationSettings({
    ...settings,
    url: 'https://hh.ru/vacancy/1',
    requestId: 'batch-settings',
  });
  const expected = settingsView({
    review: options,
    browserSlot,
    ...applicationChatSettings(settings, browserSlot),
  });
  return (
    Object.keys(settings).length === Object.keys(expected).length &&
    Object.entries(expected).every(
      ([key, value]) => JSON.stringify(value) === JSON.stringify(settings[key])
    )
  );
};
const validatePublicBatch = (row, input) => {
  applicationBatchKey(row);
  if (
    (input?.requestId !== undefined && input.requestId !== row.requestId) ||
    (input?.browserSlot !== undefined &&
      input.browserSlot !== row.browserSlot) ||
    !lifecycle(row) ||
    typeof row.paused !== 'boolean' ||
    typeof row.noQuestionnaires !== 'boolean' ||
    !publicCounts(row) ||
    !publicSettings(row.settings, row.browserSlot) ||
    !validApplicationChatView(row.chatWorker, row.settings, row.active) ||
    (row.currentUrl !== null &&
      assignmentVacancyUrl(row.currentUrl) !== row.currentUrl)
  ) {
    throw fail('batch-recovery');
  }
};
export const applicationBatchResult = (raw, input) => {
  if (!raw || raw.ok !== true || raw.mode !== 'hh-application-batch') {
    throw fail('batch-recovery');
  }
  const row = raw.batch;
  if (row !== null) {
    validatePublicBatch(row, input);
  }
  if (raw.application !== null) {
    if (
      !row ||
      raw.application.url !== row.currentUrl ||
      raw.application.requestId !== row.requestId ||
      raw.application.browserSlot !== row.browserSlot
    ) {
      throw fail('batch-recovery');
    }
    applicationResult(raw.application, raw.application);
  }
  return raw;
};
