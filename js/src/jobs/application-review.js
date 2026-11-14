import {
  assignmentVacancy,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { readAssignmentVacancyDocument } from '../assignments/vacancy-reader.js';
import { proposalMatches } from '../forms/review-apply.js';
import { reviewSnapshotKey } from '../forms/review-targets.js';
import { rememberApplicationLocation } from './application-location.js';
import { applyApplicationRunPolicy } from './application-run-modes.js';
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
      ? !options.coverLetter || record.letter === 'verified'
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
    record.vacancy = { ...assignmentVacancy(raw), url: record.url };
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
      record.state = 'verification';
      record.code = error.code;
    }
  }
  async inspect(record, signal) {
    const { filling, readPage } = this.service;
    signal.throwIfAborted();
    await filling.clear(record);
    record.page = await readPage(record.browser, record.url);
    record.state = applicationState(record.page);
    record.report = null;
    record.exact = false;
    record.code = null;
    record.letter = !record.options.coverLetter
      ? 'not-requested'
      : record.page.letter?.value === record.options.coverLetter
        ? 'verified'
        : 'not-attached';
    await this.prepare(record, signal);
    rememberApplicationLocation(record);
    this.policy(record);
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
    if (record.state === 'review' && record.page.scope && record.vacancy) {
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
  async check(record, action, signal, allowHeld = false) {
    const { readPage, filling } = this.service;
    if (!record.guard) {
      throw fail('changed');
    }
    checkPolicy(record, allowHeld);
    const before = await readPage(record.browser, record.url);
    if (
      applicationPageKey(before) !== record.guard.page ||
      !before.bound ||
      before.challenge ||
      before.dailyLimit ||
      before.external ||
      before.delivered ||
      !before[action] ||
      before[action].disabled
    ) {
      throw fail('changed');
    }
    if (record.guard.report) {
      const report = await filling.inspect(record.browser, {
        check: () => signal.throwIfAborted(),
      });
      if (reviewSnapshotKey(report) !== record.guard.report) {
        throw fail('changed');
      }
    }
    signal.throwIfAborted();
    checkPolicy(record, allowHeld);
  }
}
