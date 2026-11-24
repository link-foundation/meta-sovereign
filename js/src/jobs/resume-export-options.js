import { jobsBrowserOptions, jobsFailure, jobsObject } from './options.js';
import { resumeHash } from './resume-list.js';

export const RESUME_NATIVE_FORMATS = {
  pdf: { name: 'resume.pdf', type: 'application/pdf' },
  doc: { name: 'resume.doc', type: 'application/rtf' },
  rtf: { name: 'resume.rtf', type: 'application/rtf' },
  html: { name: 'resume.html', type: 'text/html; charset=utf-8' },
};
export const resumeExportRequestId = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(value)) {
    throw jobsFailure('export-request', 'Use a unique export request ID.');
  }
  return value;
};
export const resumeExportOptions = (input) => {
  jobsObject(input);
  const formats = input.formats ?? ['pdf', 'rtf', 'html'];
  if (
    (input.all !== undefined && typeof input.all !== 'boolean') ||
    (input.all && input.resume) ||
    !Array.isArray(formats) ||
    !formats.length ||
    formats.length > 4 ||
    formats.some((format) => !Object.hasOwn(RESUME_NATIVE_FORMATS, format)) ||
    new Set(formats).size !== formats.length
  ) {
    throw jobsFailure(
      'export-input',
      'Choose latest, a specific resume or all, with distinct native export formats.'
    );
  }
  return {
    ...jobsBrowserOptions(input),
    all: input.all === true,
    resume: input.resume ? resumeHash(input.resume) : null,
    formats: [...new Set([...formats, 'html'])].sort(),
  };
};
