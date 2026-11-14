import {
  assignmentVacancy,
  assignmentVacancyUrl,
  assignmentText,
} from '../assignments/validation.js';
import { readAssignmentVacancyDocument } from '../assignments/vacancy-reader.js';
import { proposalMatches } from '../forms/review-apply.js';
import { reviewSnapshotKey } from '../forms/review-targets.js';
import { rememberApplicationLocation } from './application-location.js';
import { rememberApplicationPopup } from './application-popup.js';
import { applyApplicationRunPolicy } from './application-run-modes.js';
import { observeApplicationResume } from './application-resume-preference.js';
import {
  applicationLetterRequested,
  applicationLetterStatus,
} from './application-letters.js';
import {
  applicationFailure as fail,
  applicationPageKey,
  applicationState,
  applicationView,
} from './application-options.js';

export const nativeApplicationFields = (report, page) =>
  report.fields.filter(
    (field) =>
      field.frame === 'frame-1' && page.fieldIndices.includes(field.index)
  );
const exactField = (field) =>
  !field.disabled &&
  !field.readOnly &&
  field.answer.source === 'exact' &&
  field.answer.complete &&
  !field.answer.effects?.length &&
  !field.answer.missing?.length &&
  Boolean(field.answer.proposal) &&
  proposalMatches(field, field.answer.proposal);
const checkPolicy = (record, allowHeld) => {
  if (
    !allowHeld &&
    (record.paused || (record.noQuestionnaires && record.page.questions))
  ) {
    throw fail('state');
  }
};
const captureError = (page, capture) =>
  capture === 'generic-error'
    ? page.error !== 'generic-error'
    : capture === 'daily-limit' && page.dailyLimit
      ? false
      : page.error;
const invalidNativeRead = (page, action, capture) =>
  !page.bound ||
  page.challenge ||
  (page.dailyLimit && capture !== 'daily-limit') ||
  page.external ||
  page.delivered ||
  captureError(page, capture) ||
  !page[action] ||
  (!capture && page[action].disabled);
export const exactApplicationPlan = (record) => {
  const { report, page, options } = record;
  if (
    !report ||
    !page.scope ||
    report.coverage !== 'inspected' ||
    report.navigation.nextPage ||
    report.navigation.limited ||
    report.omissions?.length ||
    report.fields.some((field) => field.frame !== 'frame-1')
  ) {
    return false;
  }
  const fields = nativeApplicationFields(report, page);
  if (
    fields.length !== page.fieldIndices.length ||
    (page.questions && !fields.length)
  ) {
    return false;
  }
  return fields.every((field) =>
    field.index === page.letter?.index
      ? !applicationLetterRequested(options) || record.letter === 'verified'
      : exactField(field)
  );
};

/** Shared exact-answer planning stays read-only; native submission is separate. */
export class ApplicationReview {
  constructor(service) {
    this.service = service;
  }
  async vacancy(record, signal) {
    const raw = await record.browser.commander.evaluate({
      fn: readAssignmentVacancyDocument,
      args: [],
    });
    signal.throwIfAborted();
    if (
      raw.challenge ||
      assignmentVacancyUrl(raw.url) !== record.url ||
      !raw.title ||
      !raw.description ||
      raw.skills === null
    ) {
      throw fail('vacancy');
    }
    record.vacancy = {
      ...assignmentVacancy(raw),
      salary:
        raw.salary === null
          ? null
          : assignmentText(raw.salary ?? '', 1000, 'vacancy salary', true),
      url: record.url,
    };
  }
  async plan(record, signal) {
    const { filling } = this.service;
    try {
      record.report = await filling.plan(
        record,
        {
          approximate: false,
          modelDraft: false,
          vacancy: record.vacancy,
          source: 'hh',
          chat: record.url,
        },
        () => signal.throwIfAborted()
      );
      record.exact = exactApplicationPlan(record);
    } catch (error) {
      if (error.code !== 'form-captcha') {
        throw error;
      }
      record.state = record.page.dailyLimit ? 'daily-limit' : 'verification';
      record.code = error.code;
    }
  }
  async inspect(record, signal) {
    const { filling, readPage } = this.service;
    signal.throwIfAborted();
    await filling.clear(record);
    record.page = await readPage(record.browser, record.url);
    record.state = applicationState(record.page);
    this.service.holds.observe(record);
    await this.service.limits.observe(record);
    record.report = null;
    record.exact = false;
    record.code = null;
    record.letterResume = null;
    record.letter = applicationLetterStatus(record);
    await this.prepare(record, signal);
    this.service.holds.observe(record, record.page, record.state);
    observeApplicationResume(record);
    rememberApplicationLocation(record);
    this.policy(record);
    rememberApplicationPopup(record);
    record.guard = {
      page: applicationPageKey(record.page),
      report: record.report
        ? reviewSnapshotKey(record.reviewPlan.inspection)
        : null,
    };
    await this.service.save(record);
    return applicationView(record);
  }
  async prepare(record, signal) {
    if (record.state === 'ready' && !record.vacancy) {
      await this.vacancy(record, signal);
    }
    if (
      (record.state === 'review' ||
        record.state === 'daily-limit' ||
        record.page.error === 'generic-error') &&
      record.page.scope &&
      record.vacancy
    ) {
      await this.plan(record, signal);
    }
  }
  policy(record) {
    if (record.state === 'delivered') {
      record.delivery = 'provider-confirmed';
    } else if (
      record.state === 'review' &&
      !record.attempted.submit &&
      record.delivery !== 'provider-confirmed'
    ) {
      record.delivery = 'none';
    }
    applyApplicationRunPolicy(record);
  }
  async check(record, action, signal, allowHeld = false, capture = null) {
    const { readPage, filling } = this.service;
    if (!record.guard) {
      throw fail('changed');
    }
    checkPolicy(record, allowHeld);
    const before = await readPage(record.browser, record.url);
    this.service.holds.observe(record, before);
    await this.service.limits.observe(record, before);
    if (
      applicationPageKey(before) !== record.guard.page ||
      invalidNativeRead(before, action, capture)
    ) {
      this.service.trace({
        event: 'application-review-changed',
        phase: 'native-page',
        pageChanged: applicationPageKey(before) !== record.guard.page,
      });
      throw fail('changed');
    }
    if (record.guard.report) {
      const report = await filling.inspect(record.browser, {
        check: () => signal.throwIfAborted(),
      });
      if (reviewSnapshotKey(report) !== record.guard.report) {
        this.service.trace({
          event: 'application-review-changed',
          phase: 'form-report',
        });
        throw fail('changed');
      }
    }
    signal.throwIfAborted();
    checkPolicy(record, allowHeld);
    if (!allowHeld) {
      await this.service.limits.admit(record);
      signal.throwIfAborted();
    }
  }
}
