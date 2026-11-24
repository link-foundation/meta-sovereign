import { jobsFailure } from './options.js';
import { resumeHash } from './resume-list.js';

const invalid = () => {
  throw jobsFailure(
    'application-input',
    'Use both reviewed standard letter variants, up to 24,000 characters each.'
  );
};
export const applicationStandardLetters = (raw) => {
  if (raw === undefined) {
    return undefined;
  }
  if (
    !raw ||
    Array.isArray(raw) ||
    Object.keys(raw).some((key) => !['en', 'ru'].includes(key)) ||
    ['en', 'ru'].some(
      (key) =>
        typeof raw[key] !== 'string' ||
        !raw[key].trim() ||
        raw[key].length > 24000
    )
  ) {
    invalid();
  }
  return { en: raw.en, ru: raw.ru };
};

/** Only an acknowledged system-written standard text authorizes its replacement. */
export const applicationLetterTemplate = (raw, options) => {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (
    Object.keys(raw).some(
      (key) => !['hash', 'title', 'language', 'text'].includes(key)
    ) ||
    typeof raw.title !== 'string' ||
    !raw.title.length ||
    raw.title.length > 500 ||
    !['en', 'ru'].includes(raw.language) ||
    typeof raw.text !== 'string' ||
    !raw.text.length ||
    raw.text !== options.standardLetters?.[raw.language]
  ) {
    invalid();
  }
  resumeHash(raw.hash);
  return {
    hash: raw.hash,
    title: raw.title,
    language: raw.language,
    text: raw.text,
  };
};
export const applicationLetterRequested = (options) =>
  Boolean(options.coverLetter || options.standardLetters);
export const applicationLetterLanguage = (record) =>
  record.letterResume?.languageProof.language ??
  (record.letterTemplate &&
  record.page?.resumeChooser?.title === record.letterTemplate.title
    ? record.letterTemplate.language
    : null);
export const applicationLetterText = (record) =>
  record.options.standardLetters
    ? (record.options.standardLetters[applicationLetterLanguage(record)] ?? '')
    : record.options.coverLetter;
export const applicationLetterStatus = (record) =>
  !applicationLetterRequested(record.options)
    ? 'not-requested'
    : applicationLetterText(record) &&
        record.page?.letter?.value === applicationLetterText(record)
      ? 'verified'
      : 'not-attached';

export const applicationAttachmentPage = (page) =>
  page?.bound &&
  page.delivered &&
  page.attachment &&
  !page.challenge &&
  !page.dailyLimit &&
  !page.external &&
  !page.questions &&
  !page.error &&
  !page.resumeNotVisible &&
  !page.vacancyUnavailable &&
  !page.attachment.error
    ? page.attachment
    : null;

export const applicationAttachmentStatus = (record) => {
  if (record.attachmentDelivery) {
    return record.attachmentDelivery;
  }
  const text = applicationLetterText(record);
  const attachment = applicationAttachmentPage(record.page);
  if (record.delivery !== 'provider-confirmed') {
    return null;
  }
  const seen = record.attachmentObserved ? 'needs-review' : null;
  if (!record.active || !text || !attachment) {
    return seen;
  }
  if (attachment.submit) {
    if (text.length > (attachment.maxLength ?? 24000)) {
      return seen;
    }
    if (attachment.value === text) {
      return attachment.submit.disabled ? seen : 'ready';
    }
    return attachment.value ? 'owner-conflict' : 'draft';
  }
  return attachment.offer && !attachment.offer.disabled ? 'offered' : seen;
};
