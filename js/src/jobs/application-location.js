import { assignmentVacancyUrl } from '../assignments/validation.js';
import { applicationFailure } from './application-options.js';

/** A checkpoint may reopen only the same native HH questionnaire. */
export const applicationResumeUrl = (value, vacancy) => {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    if (typeof value !== 'string' || value.length > 4000) {
      throw applicationFailure('journal');
    }
    const url = new URL(value);
    const expected = new URL(assignmentVacancyUrl(vacancy));
    if (
      url.origin !== expected.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/applicant/vacancy_response' ||
      url.searchParams.getAll('vacancyId').length !== 1 ||
      url.searchParams.get('vacancyId') !== expected.pathname.split('/').at(-1)
    ) {
      throw applicationFailure('journal');
    }
    return url.href;
  } catch {
    throw applicationFailure('journal');
  }
};

export const rememberApplicationLocation = (record) => {
  if (
    record.state === 'review' &&
    record.page.bound &&
    record.page.scope &&
    new URL(record.page.url).pathname === '/applicant/vacancy_response'
  ) {
    record.resumeUrl = applicationResumeUrl(record.page.url, record.url);
  }
};
