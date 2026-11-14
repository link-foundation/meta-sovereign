import { assignmentText } from '../assignments/validation.js';
import { encodeLinoValue, decodeWire, LINO_TEXT } from '../transport/lino.js';
import { resumeSanitizer, resumePrivateKinds } from './resume-privacy.js';
import { jobsFailure } from './options.js';

const invalid = () => {
  throw jobsFailure(
    'resume-content',
    'The sanitized resume content was not confirmed.'
  );
};
const list = (value, max) => {
  if (!Array.isArray(value) || value.length > max) {
    invalid();
  }
  return value;
};
const date = (value) => {
  if (
    value !== null &&
    (typeof value !== 'string' ||
      !/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$/u.test(value))
  ) {
    invalid();
  }
  return value;
};

/** An allowlist independent of raw exports and the contact-bearing canonical CV. */
export const sanitizedResumeCv = (raw) => {
  if (!raw || !['ru', 'en'].includes(raw.language)) {
    invalid();
  }
  const sanitize = resumeSanitizer();
  const text = (value, max = 500, optional = true) =>
    assignmentText(value ?? '', max, 'resume content', optional);
  const scalar = (value, optional = true) =>
    sanitize.scalar(text(value, 500, optional));
  const cv = {
    language: raw.language,
    name: scalar(raw.name),
    title: scalar(raw.title, false),
    skills: list(raw.skills, 500).map((value) => scalar(value, false)),
    about: sanitize.prose(text(raw.about, 24000)),
    jobs: list(raw.jobs, 200).map((job) => {
      if (
        typeof job.current !== 'boolean' ||
        (job.current && job.end !== null)
      ) {
        invalid();
      }
      return {
        company: scalar(job.company, false),
        position: scalar(job.position, false),
        start: date(job.start),
        end: date(job.end),
        current: job.current,
        period: scalar(job.period),
        area: scalar(job.area),
        website: scalar(job.website),
        industries: list(job.industries, 20).map((industry) => {
          if (!/^\d{1,8}\.\d{1,8}$/u.test(industry.id)) {
            invalid();
          }
          return {
            id: industry.id,
            name: scalar(industry.name, false),
            parent: scalar(industry.parent, false),
          };
        }),
        description: sanitize.prose(text(job.description, 24000)),
      };
    }),
  };
  if (resumePrivateKinds(JSON.stringify(cv)).length) {
    invalid();
  }
  return { cv, sanitization: sanitize.report() };
};

export const resumeCvLino = (cv) => encodeLinoValue(sanitizedResumeCv(cv).cv);
export const resumeCvFromLino = (text) =>
  sanitizedResumeCv(decodeWire(text, LINO_TEXT)).cv;

/** Derived prose contains exactly the same sanitized fields as structured output. */
export const resumeCvText = (cv, markdown = false) => {
  const heading = (value, depth) =>
    `${markdown ? `${'#'.repeat(depth)} ` : ''}${value}`;
  const parts = [
    heading(cv.title, 1),
    cv.name,
    cv.skills.join(' · '),
    cv.about,
    ...cv.jobs.flatMap((job) => [
      heading(`${job.position} · ${job.company}`, 2),
      job.period,
      [job.area, job.website].filter(Boolean).join(' · '),
      ...job.industries.map(
        (industry) => `${industry.id} · ${industry.parent} · ${industry.name}`
      ),
      job.description,
    ]),
  ];
  return `${parts.filter(Boolean).join('\n\n')}\n`;
};
