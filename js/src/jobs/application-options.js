import { assignmentVacancyUrl } from '../assignments/validation.js';
import { jobsBrowserOptions, jobsFailure, jobsObject } from './options.js';
import { applicationResumeContext } from './application-resume-context.js';
import {
  applicationConfirmations,
  applicationConfirmationPolicy,
} from './application-confirmations.js';
import { applicationInterval } from './application-pacing-data.js';
import {
  applicationStandardLetters,
  applicationLetterLanguage,
  applicationAttachmentStatus,
} from './application-letters.js';
import { applicationAnswerContext } from './application-answer-context.js';
import {
  applicationSalaryDecision,
  applicationSalaryOptions,
} from './application-salary.js';
import { applicationResumeUrl } from './application-location.js';
import {
  applicationRouteSettings,
  applicationRouteView,
} from './application-route-settings.js';
import {
  validVacancyPreviewSeconds,
  vacancyPreviewSeconds,
  applicationPreviewOptions,
} from './application-preview-settings.js';

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
const validateApplicationFlags = (input) => {
  if (
    [
      'autoExact',
      'autoSendExactAnswers',
      'autoReuseAnswers',
      'testMode',
      'recover',
      'supervised',
      'autoSelectResumeLanguage',
      'autoAnswerViewedVacancy',
      'collectVacancies',
    ].some(
      (name) => input[name] !== undefined && typeof input[name] !== 'boolean'
    ) ||
    !boundedInteger(input.reviewDelayMs ?? 3000, 30000) ||
    (input.vacancyPreviewSeconds !== undefined &&
      !validVacancyPreviewSeconds(input.vacancyPreviewSeconds))
  ) {
    throw applicationFailure('input');
  }
};
const languageSettings = (input, legacy) => {
  const standardLetters = applicationStandardLetters(input.standardLetters);
  if (standardLetters && input.coverLetter) {
    throw applicationFailure('input');
  }
  return {
    ...(!legacy || input.autoSelectResumeLanguage !== undefined
      ? { autoSelectResumeLanguage: input.autoSelectResumeLanguage ?? true }
      : {}),
    ...(standardLetters ? { standardLetters } : {}),
  };
};
// Absence keeps the acknowledged signature and defaults on only at execution.
const feedbackSettings = (input) =>
  input.autoAnswerViewedVacancy === undefined
    ? {}
    : { autoAnswerViewedVacancy: input.autoAnswerViewedVacancy };
const collectionSettings = (input) =>
  input.collectVacancies === undefined
    ? {}
    : { collectVacancies: input.collectVacancies };
const formSettings = (input, url) => {
  if (input.formUrl === undefined) {
    return {};
  }
  if (typeof input.formUrl !== 'string') {
    throw applicationFailure('input');
  }
  return { formUrl: applicationResumeUrl(input.formUrl, url) };
};
export const applicationSettings = (input, { legacy = false } = {}) => {
  const options = applicationKey(input);
  if (
    typeof input.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/u.test(input.requestId) ||
    typeof (input.coverLetter ?? '') !== 'string' ||
    (input.coverLetter ?? '').length > 24000
  ) {
    throw applicationFailure('input');
  }
  validateApplicationFlags(input);
  return {
    ...options,
    requestId: input.requestId,
    coverLetter: input.coverLetter ?? '',
    autoExact: input.autoExact === true && input.supervised !== true,
    ...(input.autoSendExactAnswers === true &&
    input.supervised !== true &&
    input.testMode !== true
      ? { autoSendExactAnswers: true }
      : {}),
    ...(input.autoReuseAnswers === true &&
    input.supervised !== true &&
    input.testMode !== true
      ? { autoReuseAnswers: true }
      : {}),
    testMode: input.testMode === true,
    reviewDelayMs: input.reviewDelayMs ?? 3000,
    // Absence preserves the exact signatures of acknowledged legacy reviews.
    ...(input.supervised === true ? { supervised: true } : {}),
    ...languageSettings(input, legacy),
    ...feedbackSettings(input),
    ...collectionSettings(input),
    ...applicationPreviewOptions(input),
    ...applicationRouteSettings(input),
    ...(input.confirmations === undefined
      ? {}
      : { confirmations: applicationConfirmations(input.confirmations) }),
    ...(input.applicationIntervalSeconds === undefined
      ? {}
      : {
          applicationIntervalSeconds: applicationInterval(
            input.applicationIntervalSeconds
          ),
        }),
    ...applicationAnswerContext(input),
    ...formSettings(input, options.url),
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
  if (page.dailyLimit) {
    return 'daily-limit';
  }
  if (page.challenge) {
    return 'verification';
  }
  if (page.external) {
    return 'external';
  }
  if (page.delivered) {
    return 'delivered';
  }
  if (page.resumeNotVisible) {
    return 'resume-not-visible';
  }
  if (page.vacancyUnavailable) {
    return 'vacancy-unavailable';
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

const continuationView = (record) => record.continuation ?? null;
const dailyRejectionView = (record) => record.limitRejection?.state ?? null;
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
            'attachment',
            'attachmentSearch',
            'returnSafe',
            'searchKey',
            'recruiterPanelOpen',
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
    ...(record.options.autoSendExactAnswers
      ? { autoSendExactAnswers: true }
      : {}),
    ...(record.options.autoReuseAnswers ? { autoReuseAnswers: true } : {}),
    supervised: record.options.supervised === true,
    confirmations: applicationConfirmationPolicy(record.options),
    continuation: continuationView(record),
    autoSelectResumeLanguage: record.options.autoSelectResumeLanguage === true,
    autoAnswerViewedVacancy: record.options.autoAnswerViewedVacancy !== false,
    collectVacancies: record.options.collectVacancies !== false,
    applicationLimit: record.applicationLimit ?? null,
    limitWait: record.limitWait ?? null,
    dailyRejection: dailyRejectionView(record),
    letterLanguage: applicationLetterLanguage(record),
    reviewDelayMs: record.options.reviewDelayMs,
    vacancyPreviewSeconds: vacancyPreviewSeconds(record.options),
    ...applicationRouteView(record.options),
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
    letterAttachment: applicationAttachmentStatus(record),
    ...(record.active && record.recruiterChat
      ? { recruiterChat: record.recruiterChat }
      : {}),
    ...(record.active &&
    record.recruiterChat === 'open' &&
    record.recruiterSkip &&
    record.recruiterReply !== 'unknown' &&
    !record.hold &&
    !record.paused &&
    !record.noQuestionnaires
      ? { recruiterSkipTarget: record.recruiterSkip.token }
      : {}),
    ...(record.recruiterReply ? { recruiterReply: record.recruiterReply } : {}),
    ...(record.recruiterDismissal
      ? { recruiterDismissal: record.recruiterDismissal }
      : {}),
    ...applicationAnswerContext(applicationSalaryOptions(record)),
    salaryAdmission: applicationSalaryDecision(
      applicationSalaryOptions(record),
      record.vacancy
    ),
  });
};
