import { assignmentVacancyUrl } from '../assignments/validation.js';
import { applicationFailure as fail } from './application-options.js';

/** Only an acknowledged unsent native popup permits a new, confirmed entry. */
export const applicationPopupCheckpoint = (value, record) => {
  if (value === null || value === undefined || value === false) {
    return false;
  }
  if (
    value !== true ||
    !record.attempted?.enter ||
    record.attempted.submit ||
    record.delivery !== 'none' ||
    !record.vacancy ||
    record.resumeUrl
  ) {
    throw fail('journal');
  }
  return true;
};

export const rememberApplicationPopup = (record) => {
  const { page } = record;
  if (
    record.attempted.submit ||
    record.delivery !== 'none' ||
    record.resumeUrl ||
    !page.bound ||
    page.challenge ||
    page.dailyLimit ||
    page.external ||
    page.error
  ) {
    record.popupReview = false;
  } else if (
    record.state === 'review' &&
    page.scope &&
    record.report &&
    record.attempted.enter &&
    assignmentVacancyUrl(page.url) === record.url
  ) {
    record.popupReview = true;
  }
};
