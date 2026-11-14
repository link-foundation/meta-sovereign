import {
  applicationDraft,
  draftRestoration,
} from './application-draft-data.js';
import { jobsFailure } from './options.js';
import {
  assignmentVacancy,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { validateFormInspection } from '../forms/plan-validation.js';
import { applicationHoldReasons } from './application-holds.js';
import { applicationResumeData } from './application-resume-data.js';

export const applicationStates = [
  'opening',
  'ready',
  'review',
  'provider-error',
  'verification',
  'daily-limit',
  'external',
  'delivered',
  'wrong-page',
  'unavailable',
  'interrupted',
  'sending',
  'review-delay',
  'deferred',
  'paused',
  'test-preview',
  'closed',
];
const text = (value, max) => typeof value === 'string' && value.length <= max;
const optionalChoice = (value, choices) =>
  value === null || value === undefined || choices.includes(value);
const fail = () => {
  throw jobsFailure(
    'application-unconfirmed',
    'This native application receipt was not confirmed.'
  );
};
const identity = (raw, input) =>
  raw?.ok === true &&
  raw.mode === 'hh-application-review' &&
  raw.url === assignmentVacancyUrl(input.url) &&
  raw.browserSlot === (input.browserSlot ?? 'jobs') &&
  (input.requestId === undefined || raw.requestId === input.requestId) &&
  typeof raw.requestId === 'string' &&
  /^[a-zA-Z0-9_-]{1,100}$/u.test(raw.requestId) &&
  text(raw.revision, 100) &&
  raw.revision.length > 0;
const supervised = (raw) =>
  (raw.supervised === undefined || typeof raw.supervised === 'boolean') &&
  (raw.autoSelectResumeLanguage === undefined ||
    typeof raw.autoSelectResumeLanguage === 'boolean') &&
  optionalChoice(raw.letterLanguage, ['en', 'ru']) &&
  !(raw.supervised && raw.autoExact);
const reentry = (raw) =>
  (raw.reentryAvailable === undefined ||
    typeof raw.reentryAvailable === 'boolean') &&
  (!raw.reentryAvailable ||
    (raw.active &&
      raw.state === 'ready' &&
      raw.attempted.enter &&
      !raw.attempted.submit &&
      raw.delivery === 'none' &&
      !raw.hold &&
      !raw.paused &&
      raw.page?.bound &&
      raw.page.enter &&
      !raw.page.submit));
const state = (raw) =>
  applicationStates.includes(raw.state) &&
  ['none', 'provider-confirmed', 'unknown'].includes(raw.delivery) &&
  ['enter', 'submit'].every(
    (name) => typeof raw.attempted?.[name] === 'boolean'
  ) &&
  [
    'active',
    'testMode',
    'autoExact',
    'noQuestionnaires',
    'paused',
    'exact',
  ].every((name) => typeof raw[name] === 'boolean') &&
  supervised(raw) &&
  Number.isInteger(raw.reviewDelayMs) &&
  raw.reviewDelayMs >= 0 &&
  raw.reviewDelayMs <= 30000 &&
  (raw.code === null || text(raw.code, 100)) &&
  optionalChoice(raw.hold, applicationHoldReasons) &&
  [
    'not-requested',
    'verified',
    'not-attached',
    'unavailable',
    'unverified',
    'owner-conflict',
  ].includes(raw.letter) &&
  (raw.state !== 'delivered' || raw.delivery === 'provider-confirmed');
const actionDescriptor = (value) =>
  value === null ||
  (value && typeof value.disabled === 'boolean' && text(value.qa, 100));
const page = (value) =>
  value === null ||
  (value &&
    [
      'bound',
      'challenge',
      'dailyLimit',
      'external',
      'delivered',
      'questions',
      'ambiguousLetter',
      'scope',
    ].every((key) => typeof value[key] === 'boolean') &&
    (value.url === null || text(value.url, 4000)) &&
    optionalChoice(value.error, ['generic-error', 'validation-error']) &&
    ['enter', 'submit', 'letterToggle'].every((key) =>
      actionDescriptor(value[key])
    ));

const validateReport = (report) => {
  if (report !== null) {
    if (report.mode !== 'answer-plan' || !report.reviewPlan?.id) {
      fail();
    }
    validateFormInspection({ ...report, mode: 'read-only' });
  }
};

const validateMissing = (raw, input) => {
  if (
    raw.ok !== true ||
    raw.url !== assignmentVacancyUrl(input.url) ||
    raw.browserSlot !== (input.browserSlot ?? 'jobs') ||
    raw.requestId !== (input.requestId ?? null)
  ) {
    fail();
  }
};

/** Bind public receipts before any UI uses their readiness or delivery state. */
export const applicationResult = (raw, input) => {
  try {
    if (raw?.mode === 'hh-application-missing') {
      validateMissing(raw, input);
      return raw;
    }
    if (!identity(raw, input) || !state(raw) || !page(raw.page)) {
      fail();
    }
    if (raw.vacancy !== null) {
      if (raw.vacancy.url !== raw.url) {
        fail();
      }
      assignmentVacancy(raw.vacancy);
    }
    validateReport(raw.report);
    applicationResumeData(raw, input);
    if (!reentry(raw)) {
      fail();
    }
    applicationDraft(raw.draft);
    draftRestoration(raw.restoration);
    if (raw.exact && (!raw.report || !raw.page?.scope)) {
      fail();
    }
    if (JSON.stringify(raw).length > 3 * 1024 ** 2) {
      fail();
    }
  } catch {
    fail();
  }
  return raw;
};
