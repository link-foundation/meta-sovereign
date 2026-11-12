import { resumeHash } from './resume-list.js';
import { cvWatchUrl } from './cv-watch-browser.js';
import { resumePeriod } from './resume-dates.js';
import { jobsFailure } from './options.js';
import { confirmedCvIndustryIds } from './cv-watch-industries.js';

const invalid = () => {
  throw jobsFailure(
    'cv-attempt',
    'The final native CV fields were not confirmed.'
  );
};
const text = (value, max) => {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) {
    invalid();
  }
  return value;
};
const normalize = (value) =>
  value
    .replace(/\r/gu, '')
    .replace(/[^\S\n]+/gu, ' ')
    .trim();
const website = (value) =>
  normalize(value)
    .replace(/^https?:\/\//iu, '')
    .replace(/\/$/u, '')
    .toLowerCase();
export const cvSaveAttempt = (raw) => {
  cvWatchUrl(raw.url);
  if (raw.kind === 'about') {
    const urlHash = new URL(raw.url).pathname.match(
      /^\/resume\/(?:edit\/)?([a-zA-Z\d_-]+)(?:\/|$)/u
    )?.[1];
    if (raw.hash !== urlHash) {
      invalid();
    }
    return {
      kind: raw.kind,
      hash: resumeHash(raw.hash),
      about: text(raw.about, 24000),
    };
  }
  return workplaceAttempt(raw);
};

const workplaceResumes = (raw) => {
  const recordId =
    new URL(raw.url).pathname.match(
      /^\/profile\/edit\/experience\/(\d+)\/?$/u
    )?.[1] ?? null;
  if (
    raw.kind !== 'workplace' ||
    typeof raw.current !== 'boolean' ||
    typeof raw.metadataEditable !== 'boolean' ||
    raw.recordId !== recordId ||
    !Array.isArray(raw.resumes) ||
    !raw.resumes.length ||
    raw.resumes.length > 100
  ) {
    invalid();
  }
  const resumes = raw.resumes.map((row) => {
    if (typeof row.checked !== 'boolean') {
      invalid();
    }
    return { hash: resumeHash(row.hash), checked: row.checked };
  });
  if (new Set(resumes.map((row) => row.hash)).size !== resumes.length) {
    invalid();
  }
  return resumes;
};

const workplaceAttempt = (raw) => {
  const resumes = workplaceResumes(raw);
  const start = resumePeriod(`${text(raw.start, 100)} — present`).start;
  const end = raw.current
    ? null
    : resumePeriod(`${text(raw.end, 100)} — present`).start;
  // Year-only precision cannot confirm the native month picker.
  if (
    !/^\d{4}-\d{2}$/u.test(start ?? '') ||
    (!raw.current && !/^\d{4}-\d{2}$/u.test(end ?? ''))
  ) {
    invalid();
  }
  return {
    kind: raw.kind,
    recordId: raw.recordId,
    resumes,
    company: text(raw.company, 500),
    position: text(raw.position, 500),
    description: text(raw.description, 24000),
    start,
    end,
    current: raw.current,
    metadataEditable: raw.metadataEditable,
    locale: /^ru\b/iu.test(raw.locale ?? '') ? 'ru' : 'en',
    area: text(raw.area, 500),
    website: text(raw.website, 500),
    industryText:
      raw.industryText === null ? null : text(raw.industryText, 10000),
  };
};

const sameWorkplace = (attempt, saved) => {
  if (
    !attempt.recordId ||
    !attempt.metadataEditable ||
    attempt.industryText === null ||
    saved?.kind !== 'workplace' ||
    saved.recordId !== attempt.recordId ||
    !saved.metadataEditable ||
    saved.industryText === null ||
    saved.resumes.length !== attempt.resumes.length
  ) {
    return false;
  }
  const fields = ['company', 'position', 'description', 'area', 'industryText'];
  return (
    fields.every(
      (field) => normalize(saved[field]) === normalize(attempt[field] ?? '')
    ) &&
    saved.start === attempt.start &&
    saved.end === attempt.end &&
    saved.current === attempt.current &&
    website(saved.website) === website(attempt.website) &&
    attempt.resumes.every(({ hash, checked }) =>
      saved.resumes.some((row) => row.hash === hash && row.checked === checked)
    )
  );
};

/** Exact record membership plus fresh exports; a closed form proves nothing. */
export const verifyCvSave = (attempt, exports, savedWorkplace) => {
  const one = (hash) => {
    const rows = exports.filter((row) => row.hash === hash);
    return rows.length === 1 ? rows[0] : null;
  };
  if (attempt.kind === 'about') {
    const cv = one(attempt.hash);
    return Boolean(cv && normalize(cv.cv.about) === normalize(attempt.about));
  }
  if (
    exports.length !== attempt.resumes.length ||
    !sameWorkplace(attempt, savedWorkplace)
  ) {
    return false;
  }
  return attempt.resumes.every(({ hash, checked }) => {
    const cv = one(hash);
    if (!cv) {
      return false;
    }
    const matches = cv.cv.jobs.filter(
      (job) =>
        job.company === attempt.company &&
        job.position === attempt.position &&
        job.start === attempt.start &&
        job.end === attempt.end &&
        job.current === attempt.current &&
        normalize(job.description) === normalize(attempt.description)
    );
    if (!checked) {
      // The exact record's fresh native checkbox proves exclusion; unrelated
      // and even text-identical records in this CV must remain untouched.
      return true;
    }
    if (
      matches.length !== 1 ||
      !attempt.metadataEditable ||
      attempt.industryText === null
    ) {
      // Hidden company metadata cannot establish a complete saved record.
      return false;
    }
    const job = matches[0];
    const ids = confirmedCvIndustryIds(
      attempt.industryText,
      cv.industryEntries
    );
    return (
      normalize(job.area) === normalize(attempt.area) &&
      website(job.website) === website(attempt.website) &&
      ids !== null &&
      JSON.stringify(job.industries.map((row) => row.id).sort()) ===
        JSON.stringify(ids)
    );
  });
};
