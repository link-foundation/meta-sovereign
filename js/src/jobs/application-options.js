import { assignmentVacancyUrl } from '../assignments/validation.js';
import { jobsBrowserOptions, jobsFailure, jobsObject } from './options.js';
import { applicationResumeContext } from './application-resume-context.js';

export const applicationFailure = (kind) =>
  jobsFailure(
    `application-${kind}`,
    'The native HH application was not confirmed. Read its current state before continuing.'
  );
export const applicationKey = (input) => {
  jobsObject(input);
  const url = assignmentVacancyUrl(input.url);
  const browser = jobsBrowserOptions(input);
  return {
    url,
    ...browser,
    id: `secret:jobs-application:${browser.browserSlot}:${url.split('/').at(-1)}`,
  };
};
const boundedInteger = (value, max) =>
  Number.isInteger(value) && value >= 0 && value <= max;
export const applicationSettings = (input) => {
  const options = applicationKey(input);
  if (
    typeof input.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/u.test(input.requestId) ||
    typeof (input.coverLetter ?? '') !== 'string' ||
    (input.coverLetter ?? '').length > 24000
  ) {
    throw applicationFailure('input');
  }
  if (
    ['autoExact', 'testMode', 'recover', 'supervised'].some(
      (name) => input[name] !== undefined && typeof input[name] !== 'boolean'
    ) ||
    !boundedInteger(input.reviewDelayMs ?? 3000, 30000)
  ) {
    throw applicationFailure('input');
  }
  return {
    ...options,
    requestId: input.requestId,
    coverLetter: input.coverLetter ?? '',
    autoExact: input.autoExact === true && input.supervised !== true,
    testMode: input.testMode === true,
    reviewDelayMs: input.reviewDelayMs ?? 3000,
    // Absence preserves the exact signatures of acknowledged legacy reviews.
    ...(input.supervised === true ? { supervised: true } : {}),
  };
};
export const applicationDelay = (ms, signal) =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
export const applicationPageKey = (page) => JSON.stringify(page);
export const applicationState = (page) => {
  if (!page.bound) {
    return 'wrong-page';
  }
  if (page.challenge) {
    return 'verification';
  }
  if (page.dailyLimit) {
    return 'daily-limit';
  }
  if (page.external) {
    return 'external';
  }
  if (page.delivered) {
    return 'delivered';
  }
  if (page.error) {
    return 'provider-error';
  }
  if (page.submit) {
    return 'review';
  }
  return page.enter ? 'ready' : 'unavailable';
};
export const applicationCanReenter = (record) =>
  record.active === true &&
  record.state === 'ready' &&
  record.popupReview === true &&
  record.attempted.enter &&
  !record.attempted.submit &&
  record.delivery === 'none' &&
  !record.hold &&
  !record.paused;

export const applicationView = (record) => {
  const page =
    record.page &&
    Object.fromEntries(
      Object.entries(record.page).filter(
        ([key]) =>
          ![
            'documentKey',
            'scopeKey',
            'scopeStructureKey',
            'fieldIndices',
            'questionIndices',
            'resumeIndices',
          ].includes(key)
      )
    );
  return globalThis.structuredClone({
    ok: true,
    mode: 'hh-application-review',
    requestId: record.requestId,
    url: record.url,
    browserSlot: record.browserSlot,
    revision: record.revision,
    state: record.state,
    active: record.active === true,
    attempted: record.attempted,
    reentryAvailable: applicationCanReenter(record),
    delivery: record.delivery,
    code: record.code ?? null,
    hold: record.hold ?? null,
    testMode: record.options.testMode,
    autoExact: record.options.autoExact,
    supervised: record.options.supervised === true,
    reviewDelayMs: record.options.reviewDelayMs,
    noQuestionnaires: record.noQuestionnaires ?? false,
    paused: record.paused ?? false,
    vacancy: record.vacancy ?? null,
    page: page ?? null,
    report: record.report ?? null,
    draft: record.draft ?? null,
    restoration: record.restoration ?? null,
    exact: record.exact === true,
    resumeContext: applicationResumeContext(record),
    resumePreference: record.resumePreference ?? null,
    letter: record.letter ?? 'not-requested',
  });
};
