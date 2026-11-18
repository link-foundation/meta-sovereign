import {
  assignmentVacancy,
  assignmentVacancyUrl,
  assignmentText,
} from '../assignments/validation.js';
import { readAssignmentVacancyDocument } from '../assignments/vacancy-reader.js';
import { readLoadedVacancy } from '../assignments/vacancy-loading.js';
import { vacancySnapshot } from '../assignments/vacancy.js';
import { proposalMatches } from '../forms/review-apply.js';
import { reviewSnapshotKey } from '../forms/review-targets.js';
import { rememberApplicationLocation } from './application-location.js';
import { rememberApplicationPopup } from './application-popup.js';
import { observeVacancySkip } from './vacancy-skip-service.js';
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
export const approvedExactApplicationAnswer = (field) =>
  field.answer.source === 'exact' && field.answer.reuseRequiresReview === false;
const exactField = (field) =>
  !field.disabled &&
  !field.readOnly &&
  approvedExactApplicationAnswer(field) &&
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
  page.resumeNotVisible ||
  page.vacancyUnavailable ||
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
    const raw = await readLoadedVacancy(
      record.browser,
      readAssignmentVacancyDocument,
      { url: record.url, signal, trace: this.service.trace }
    );
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
    const vacancy = {
      ...assignmentVacancy(raw),
      salary:
        raw.salary === null
          ? null
          : assignmentText(raw.salary ?? '', 1000, 'vacancy salary', true),
      url: record.url,
    };
    if (!record.options.testMode && vacancy.salary !== null) {
      await vacancySnapshot(
        this.service.store,
        async () => ({
          ...raw,
          ...vacancy,
          salary: vacancy.salary ?? '',
          capturedAt: new Date().toISOString(),
        }),
        record.url,
        true,
        signal
      );
    }
    record.vacancy = vacancy;
    this.service.trace({
      event: 'application-vacancy-context',
      popup: record.page.scope,
      preview: record.options.testMode,
      salaryReadable: vacancy.salary !== null,
      salaryAdvertised: Boolean(vacancy.salary),
    });
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
          profileId: record.options.profileId,
          salary: record.options.salary,
        },
        () => signal.throwIfAborted()
      );
      record.exact = exactApplicationPlan(record);
      this.service.trace({
        event: 'application-answer-approval',
        namedProfile: Boolean(record.options.profileId),
        salaryCurrencies: record.options.salary?.currencies.length ?? 0,
        exact: record.exact,
        reviewRequired: record.report.fields.filter(
          (field) =>
            field.answer.source === 'exact' &&
            !approvedExactApplicationAnswer(field)
        ).length,
      });
    } catch (error) {
      if (error.code !== 'form-captcha') {
        throw error;
      }
      record.state = record.page.dailyLimit ? 'daily-limit' : 'verification';
      record.code = error.code;
    }
  }
  async cachedVacancy(record, signal) {
    if (record.options.testMode || record.vacancy.salary === null) {
      return;
    }
    const cached = await vacancySnapshot(
      this.service.store,
      async () => ({
        ...record.vacancy,
        salary: record.vacancy.salary ?? '',
        capturedAt: new Date().toISOString(),
      }),
      record.url,
      false,
      signal
    );
    record.vacancy = {
      ...assignmentVacancy(cached),
      salary: cached.salary,
      url: record.url,
    };
  }
  async inspect(record, signal) {
    const { filling, readPage } = this.service;
    signal.throwIfAborted();
    await filling.clear(record);
    record.continuation = null;
    record.page = await readPage(record.browser, record.url);
    record.state = applicationState(record.page);
    this.service.holds.observe(record);
    await this.service.limits.observe(record);
    await this.service.pacing.observe(record, signal);
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
    await observeVacancySkip(this.service.store, record);
    await this.service.context.recover(record, signal);
    return applicationView(record);
  }
  async prepare(record, signal) {
    if (
      record.state === 'ready' ||
      (record.state === 'review' &&
        !record.vacancy &&
        record.page.url === record.url)
    ) {
      await this.vacancy(record, signal);
    }
    if (
      (record.state === 'review' ||
        record.state === 'daily-limit' ||
        record.page.error === 'generic-error') &&
      record.page.scope
    ) {
      if (record.vacancy) {
        await this.cachedVacancy(record, signal);
      }
      await this.plan(record, signal);
    }
  }
  policy(record) {
    if (record.state === 'delivered') {
      record.delivery = 'provider-confirmed';
    } else if (
      record.state === 'review' &&
      !record.attempted.submit &&
      record.limitRejection?.state !== 'recorded' &&
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
    await this.service.salary.refresh(record, signal);
    const before = await readPage(record.browser, record.url);
    this.service.holds.observe(record, before);
    await this.service.limits.observe(record, before);
    await this.service.pacing.observe(record, signal, before);
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
