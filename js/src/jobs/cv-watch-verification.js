import { createHash } from 'node:crypto';
import { resumeHash } from './resume-list.js';
import { cvWatchUrl } from './cv-watch-browser.js';
import { resumePeriod } from './resume-dates.js';
import { jobsFailure } from './options.js';
import { confirmedCvIndustryIds } from './cv-watch-industries.js';
import { resolveResumeArea } from './areas.js';

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
  if (raw.kind === 'about') {
    const urlHash = cvWatchUrl(raw.url).pathname.match(
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

export const cvWorkplaceSaveResumes = (raw) => {
  const url = cvWatchUrl(raw.url);
  const recordId =
    url.pathname.match(/^\/profile\/edit\/experience\/(\d+)\/?$/u)?.[1] ?? null;
  if (
    raw.kind !== 'workplace' ||
    raw.recordId !== recordId ||
    (recordId === null &&
      !/^\/profile\/edit\/experience\/?$/u.test(url.pathname)) ||
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
  const resumes = cvWorkplaceSaveResumes(raw);
  if (
    typeof raw.current !== 'boolean' ||
    typeof raw.metadataEditable !== 'boolean'
  ) {
    invalid();
  }
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

const sameDates = (left, right) =>
  ['start', 'end', 'current'].every((field) => left[field] === right[field]);

export const sameCvWorkplace = (attempt, saved, areaEntries) => {
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
  const fields = ['company', 'position', 'description', 'industryText'];
  return (
    fields.every(
      (field) => normalize(saved[field]) === normalize(attempt[field] ?? '')
    ) &&
    sameAreaNames(attempt.area, saved.area, areaEntries) &&
    sameDates(saved, attempt) &&
    website(saved.website) === website(attempt.website) &&
    attempt.resumes.every(({ hash, checked }) =>
      saved.resumes.some((row) => row.hash === hash && row.checked === checked)
    )
  );
};

const sameJobFields = (attempt, job) =>
  job.company === attempt.company &&
  job.position === attempt.position &&
  sameDates(job, attempt) &&
  normalize(job.description) === normalize(attempt.description);

/** Complete exported metadata must match the exact native record. */
export const cvWorkplaceMatchesJob = (
  attempt,
  job,
  industryEntries,
  areaEntries
) => {
  if (
    !attempt.metadataEditable ||
    attempt.industryText === null ||
    !sameJobFields(attempt, job)
  ) {
    return false;
  }
  const ids = confirmedCvIndustryIds(attempt.industryText, industryEntries);
  return (
    sameArea(attempt, job, areaEntries) &&
    website(job.website) === website(attempt.website) &&
    ids !== null &&
    JSON.stringify(job.industries.map((row) => row.id).sort()) ===
      JSON.stringify(ids)
  );
};

const sameArea = (attempt, job, entries) => {
  if (job.areaId && entries) {
    try {
      return (
        resolveResumeArea(attempt.area, entries)?.id === job.areaId &&
        resolveResumeArea(job.area, entries)?.id === job.areaId
      );
    } catch {
      return false;
    }
  }
  return normalize(job.area) === normalize(attempt.area);
};

const sameAreaNames = (before, after, entries) => {
  if (!entries?.length) {
    return normalize(before) === normalize(after);
  }
  try {
    return (
      resolveResumeArea(before, entries)?.id ===
      resolveResumeArea(after, entries)?.id
    );
  } catch {
    return false;
  }
};

const jobFingerprint = (job) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        job.company,
        job.position,
        job.start,
        job.end,
        job.current,
        normalize(job.description),
        job.areaId ? [job.areaId] : normalize(job.area),
        website(job.website),
        job.industries.map((row) => row.id).sort(),
      ])
    )
    .digest('hex');

const missingExportBaseline = () =>
  jobsFailure(
    'cv-record',
    'The complete pre-Save CV exports were not confirmed.'
  );

export const confirmedCvWorkplaceExportBaseline = (baseline, resumes) => {
  if (
    !(baseline instanceof Map) ||
    baseline.size !== resumes.length ||
    resumes.some(({ hash }) => !Array.isArray(baseline.get(hash)))
  ) {
    throw missingExportBaseline();
  }
  return baseline;
};

/** Keep only one opaque fingerprint per prior job, with duplicates preserved. */
export const cvWorkplaceExportBaseline = (exports, resumes) => {
  if (!Array.isArray(exports) || exports.length !== resumes.length) {
    throw missingExportBaseline();
  }
  return confirmedCvWorkplaceExportBaseline(
    new Map(exports.map((row) => [row.hash, row.cv.jobs.map(jobFingerprint)])),
    resumes
  );
};

/** Capture saved membership and the exported fingerprint of just this record. */
export const cvWorkplaceMembershipBaseline = (saved, exports) => {
  const jobs = cvWorkplaceExportBaseline(exports, saved.resumes);
  return {
    recordId: saved.recordId,
    resumes: new Map(
      exports.map((row) => {
        const { checked } = saved.resumes.find(({ hash }) => hash === row.hash);
        const matching = new Set(
          checked
            ? row.cv.jobs
                .filter((job) =>
                  cvWorkplaceMatchesJob(
                    saved,
                    job,
                    row.industryEntries,
                    row.areaEntries
                  )
                )
                .map(jobFingerprint)
            : []
        );
        return [row.hash, { checked, jobs: jobs.get(row.hash), matching }];
      })
    ),
  };
};

const workplaceAddedToExport = (attempt, cv, checked, previous) => {
  if (cv.cv.jobs.length !== previous.length + Number(checked)) {
    return false;
  }
  const counts = new Map();
  for (const key of previous) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let added;
  for (const job of cv.cv.jobs) {
    const key = jobFingerprint(job);
    const remaining = counts.get(key);
    if (remaining) {
      counts.set(key, remaining - 1);
    } else if (!checked || added) {
      return false;
    } else {
      added = job;
    }
  }
  return (
    !checked ||
    Boolean(
      added &&
      cvWorkplaceMatchesJob(attempt, added, cv.industryEntries, cv.areaEntries)
    )
  );
};

const cvWorkplaceMembershipDelta = (attempt, baseline) => {
  if (baseline?.recordId !== attempt.recordId) {
    return null;
  }
  const { resumes } = baseline;
  if (
    resumes.size !== attempt.resumes.length ||
    attempt.resumes.some(({ hash }) => !resumes.has(hash))
  ) {
    throw missingExportBaseline();
  }
  if (
    attempt.resumes.every(
      ({ hash, checked }) => resumes.get(hash).checked === checked
    )
  ) {
    return null;
  }
  return new Map(
    [...resumes].map(([hash, { checked, jobs, matching }]) => {
      if (!checked) {
        return [hash, jobs];
      }
      if (matching.size !== 1) {
        throw missingExportBaseline();
      }
      const index = jobs.indexOf(matching.values().next().value);
      return [hash, [...jobs.slice(0, index), ...jobs.slice(index + 1)]];
    })
  );
};

/** Exact record membership plus fresh exports; a closed form proves nothing. */
export const verifyCvSave = (
  attempt,
  exports,
  savedWorkplace,
  baseline,
  membership
) => {
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
    !sameCvWorkplace(
      attempt,
      savedWorkplace,
      exports.flatMap((row) => row.areaEntries ?? [])
    )
  ) {
    return false;
  }
  const previous = baseline ?? cvWorkplaceMembershipDelta(attempt, membership);
  return attempt.resumes.every(({ hash, checked }) => {
    const cv = one(hash);
    if (!cv) {
      return false;
    }
    if (previous) {
      return workplaceAddedToExport(attempt, cv, checked, previous.get(hash));
    }
    const matches = cv.cv.jobs.filter((job) => sameJobFields(attempt, job));
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
    return cvWorkplaceMatchesJob(
      attempt,
      matches[0],
      cv.industryEntries,
      cv.areaEntries
    );
  });
};
