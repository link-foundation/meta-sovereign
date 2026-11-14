import { assignmentText } from '../assignments/validation.js';
import { browserName } from '../browser/policy.js';
import { jobsFailure, jobsObject } from './options.js';
import { resumeDate } from './resume-dates.js';
import { resumeLanguageProof } from './resume-language.js';

export const HH_RESUMES_URL = 'https://hh.ru/applicant/resumes';
export const resumeListId = (slot) => `jobs-resumes:${browserName(slot)}`;
const unavailable = () => {
  throw jobsFailure(
    'resumes-unavailable',
    'The requested resume list was not confirmed.'
  );
};
export const resumeHash = (hash) => {
  if (typeof hash !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(hash)) {
    unavailable();
  }
  return hash;
};
const entry = (raw, seen, capturedAt) => {
  jobsObject(raw);
  const hash = resumeHash(raw.hash);
  if (seen.has(hash) || typeof raw.latest !== 'boolean') {
    unavailable();
  }
  seen.add(hash);
  const updatedText = assignmentText(
    raw.updatedText ?? '',
    200,
    'resume date',
    true
  );
  const updatedAt =
    raw.updatedAt ?? resumeDate(updatedText, new Date(capturedAt));
  if (
    updatedAt !== null &&
    (!Number.isFinite(updatedAt) ||
      updatedAt <= 0 ||
      updatedAt > Date.parse(capturedAt) + 86400000)
  ) {
    unavailable();
  }
  return {
    hash,
    url: `https://hh.ru/resume/${hash}`,
    title: assignmentText(raw.title, 500, 'resume title'),
    updatedAt,
    updatedText,
    latest: raw.latest,
  };
};

/** Strict portable projection. Raw account state never leaves the owned document. */
export const resumeList = (raw, browserSlot, acceptLanguageProof = false) => {
  jobsObject(raw);
  const slot = browserName(browserSlot ?? raw.browserSlot);
  if (
    (raw.browserSlot !== undefined && raw.browserSlot !== slot) ||
    raw.url !== HH_RESUMES_URL ||
    raw.challenge !== false ||
    raw.observed !== true ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 100 ||
    typeof raw.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.capturedAt))
  ) {
    unavailable();
  }
  const seen = new Set();
  const entries = raw.entries.map((row) => {
    const value = entry(row, seen, raw.capturedAt);
    return {
      ...value,
      ...(acceptLanguageProof && row.languageProof !== undefined
        ? { languageProof: resumeLanguageProof(row.languageProof, value) }
        : {}),
    };
  });
  if (entries.filter((row) => row.latest).length > 1) {
    unavailable();
  }
  return {
    url: HH_RESUMES_URL,
    browserSlot: slot,
    capturedAt: raw.capturedAt,
    observed: true,
    challenge: false,
    entries,
  };
};

export const resumeChoiceOptions = (input = {}) => {
  jobsObject(input);
  const language = input.resumeLanguage ?? 'ru';
  if (!['ru', 'en', 'any'].includes(language)) {
    throw jobsFailure(
      'input',
      'Choose ru, en or any for the resume language preference.'
    );
  }
  return {
    resumeLanguage: language,
    ...(input.resume === undefined || input.resume === ''
      ? {}
      : { resume: resumeHash(input.resume) }),
  };
};

const titleMatches = (row, language) =>
  !row.languageProof &&
  (language === 'ru'
    ? /[а-яё]/iu.test(row.title)
    : /[a-z]/iu.test(row.title) && !/[а-яё]/iu.test(row.title));
const selectionReason = (selected, dated) =>
  !selected
    ? 'empty'
    : dated.length
      ? 'updated'
      : selected.latest
        ? 'latest'
        : 'list-order';
const languageEvidence = (selected, titleHint = false) =>
  selected?.languageProof
    ? 'native-export'
    : titleHint
      ? 'title-hint'
      : 'unknown';

/** Verified exports outrank title hints; an explicit owner choice always wins. */
export const chooseSearchResume = (list, input = {}) => {
  const { resumeLanguage: language } = resumeChoiceOptions(input);
  if (input.resume) {
    const hash = resumeHash(input.resume);
    if (!list.entries.some((row) => row.hash === hash)) {
      throw jobsFailure(
        'resume-missing',
        'The selected resume is absent from this observed list.'
      );
    }
    return {
      hash,
      reason: 'specified',
      languagePreference: language,
      languageEvidence: languageEvidence(
        list.entries.find((row) => row.hash === hash)
      ),
    };
  }
  const verified = list.entries.filter(
    (row) => row.languageProof?.language === language
  );
  const preferred =
    language === 'any'
      ? []
      : verified.length
        ? verified
        : list.entries.filter((row) => titleMatches(row, language));
  const candidates = preferred.length ? preferred : list.entries;
  const dated = candidates.filter((row) => row.updatedAt !== null);
  const selected = dated.length
    ? dated.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a))
    : (candidates.find((row) => row.latest) ?? candidates[0]);
  return {
    hash: selected?.hash ?? null,
    reason: selectionReason(selected, dated),
    languagePreference: language,
    languageEvidence: languageEvidence(selected, preferred.length > 0),
  };
};
