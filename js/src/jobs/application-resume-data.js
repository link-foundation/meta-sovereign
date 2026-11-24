import { applicationFailure as fail } from './application-options.js';
import { resumeHash } from './resume-list.js';
import { resumeLanguageProof } from './resume-language.js';
import { applicationResumePreference } from './application-resume-preference.js';

const title = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 500;

const chooserShape = (raw) =>
  typeof raw.title === 'string' &&
  raw.title.length <= 500 &&
  (raw.ambiguous || title(raw.title)) &&
  ['open', 'disabled', 'ambiguous'].every(
    (key) => typeof raw[key] === 'boolean'
  ) &&
  Array.isArray(raw.options) &&
  raw.options.length <= 101;
const optionShape = (option, ambiguous) =>
  typeof option.hash === 'string' &&
  option.hash.length <= 100 &&
  typeof option.title === 'string' &&
  option.title.length <= 500 &&
  (ambiguous || title(option.title)) &&
  typeof option.checked === 'boolean' &&
  typeof option.disabled === 'boolean';
const uniqueChoices = (raw) =>
  raw.options.length <= 100 &&
  new Set(raw.options.map((row) => row.hash)).size === raw.options.length &&
  raw.options.filter((row) => row.checked).length <= 1 &&
  (raw.open || !raw.options.length);

/** Native titles are identities only; they never prove the language of a CV. */
export const applicationResumeChooser = (raw) => {
  if (raw === undefined || raw === null) {
    return;
  }
  if (!chooserShape(raw)) {
    throw fail('unconfirmed');
  }
  for (const option of raw.options) {
    if (!optionShape(option, raw.ambiguous)) {
      throw fail('unconfirmed');
    }
    if (!raw.ambiguous) {
      resumeHash(option.hash);
    }
  }
  if (!raw.ambiguous && !uniqueChoices(raw)) {
    throw fail('unconfirmed');
  }
};

const selectionMatchesInput = (raw, input, context) =>
  input.action === 'context'
    ? context?.language && raw.languageProof?.language === context.language
    : resumeHash(raw.hash) === input.resume;

export const applicationResumeSelection = (raw, input, page, context) => {
  if (raw === undefined) {
    return;
  }
  if (
    !raw ||
    !selectionMatchesInput(raw, input, context) ||
    !title(raw.title) ||
    raw.title !== page?.resumeChooser?.title ||
    page.resumeChooser.open ||
    page.resumeChooser.ambiguous ||
    !Number.isFinite(raw.languageProof?.updatedAt) ||
    raw.languageProof.updatedAt <= 0
  ) {
    throw fail('unconfirmed');
  }
  resumeLanguageProof(raw.languageProof, {
    updatedAt: raw.languageProof?.updatedAt,
  });
  resumeHash(raw.hash);
};

const contextShape = (raw) => {
  if (raw === undefined) {
    return;
  }
  if (
    !raw ||
    ![null, 'ru', 'en'].includes(raw.language) ||
    !(raw.language === null
      ? ['unknown', 'unreadable'].includes(raw.reason)
      : ['dollar-pay', 'questions', 'description', 'title'].includes(
          raw.reason
        )) ||
    (raw.reason === 'dollar-pay' && raw.language !== 'en')
  ) {
    throw fail('unconfirmed');
  }
};

export const applicationResumeData = (raw, input) => {
  applicationResumePreference(raw.resumePreference);
  applicationResumeChooser(raw.page?.resumeChooser);
  contextShape(raw.resumeContext);
  applicationResumeSelection(
    raw.resumeSelection,
    input,
    raw.page,
    raw.resumeContext
  );
  if (
    raw.vacancy?.salary !== undefined &&
    raw.vacancy.salary !== null &&
    (typeof raw.vacancy.salary !== 'string' || raw.vacancy.salary.length > 1000)
  ) {
    throw fail('unconfirmed');
  }
};
