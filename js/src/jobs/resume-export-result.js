import { assignmentText } from '../assignments/validation.js';
import { browserName } from '../browser/policy.js';
import { resumeHash } from './resume-list.js';
import { jobsFailure } from './options.js';
import { RESUME_NATIVE_FORMATS } from './resume-export-options.js';

export const RESUME_DERIVED_FORMATS = {
  markdown: { name: 'resume.md', type: 'text/markdown; charset=utf-8' },
  text: { name: 'resume.txt', type: 'text/plain; charset=utf-8' },
  structured: { name: 'resume.json', type: 'application/json' },
  lino: { name: 'resume.lino', type: 'text/lino; charset=utf-8' },
};
const specs = [
  ...Object.values(RESUME_NATIVE_FORMATS),
  ...Object.values(RESUME_DERIVED_FORMATS),
];
export const invalidResumeExport = () => {
  throw jobsFailure(
    'export-unconfirmed',
    'The saved resume export was not confirmed.'
  );
};
export const resumeExportId = (id) => {
  if (
    typeof id !== 'string' ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/u.test(id)
  ) {
    invalidResumeExport();
  }
  return id;
};
const sanitizationReport = (raw) => {
  if (
    !Number.isInteger(raw?.removedLines) ||
    raw.removedLines < 0 ||
    !Array.isArray(raw.kinds) ||
    raw.kinds.some(
      (kind) =>
        !['email', 'phone', 'messenger', 'birth-date', 'salary'].includes(kind)
    )
  ) {
    invalidResumeExport();
  }
  return {
    removedLines: raw.removedLines,
    kinds: [...new Set(raw.kinds)].sort(),
  };
};
/** Small receipts only. Raw provider content and server paths stay in private files. */
export const resumeExportResult = (raw) => {
  if (
    !raw ||
    !['ru', 'en'].includes(raw.language) ||
    raw.languageEvidence !== 'native-export' ||
    typeof raw.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.capturedAt)) ||
    (raw.updatedAt !== null &&
      (!Number.isFinite(raw.updatedAt) || raw.updatedAt <= 0)) ||
    !Array.isArray(raw.files) ||
    raw.files.length < 5 ||
    raw.files.length > 8
  ) {
    invalidResumeExport();
  }
  const seen = new Set();
  const files = raw.files.map((file) => {
    const spec = specs.find(
      (item) => item.name === file.name && item.type === file.type
    );
    if (
      !spec ||
      seen.has(file.name) ||
      !Number.isInteger(file.size) ||
      file.size <= 0 ||
      file.size > 8 * 1024 ** 2 ||
      !/^[a-f\d]{64}$/u.test(file.sha256) ||
      file.native !==
        Object.values(RESUME_NATIVE_FORMATS).some(
          (item) => item.name === file.name
        )
    ) {
      invalidResumeExport();
    }
    seen.add(file.name);
    return {
      ...spec,
      size: file.size,
      sha256: file.sha256,
      native: file.native,
    };
  });
  if (
    !seen.has('resume.html') ||
    !Object.values(RESUME_DERIVED_FORMATS).every((spec) => seen.has(spec.name))
  ) {
    invalidResumeExport();
  }
  return {
    exportId: resumeExportId(raw.exportId),
    hash: resumeHash(raw.hash),
    browserSlot: browserName(raw.browserSlot),
    title: assignmentText(raw.title, 500, 'export title'),
    language: raw.language,
    languageEvidence: 'native-export',
    updatedAt: raw.updatedAt,
    capturedAt: raw.capturedAt,
    files,
    sanitization: sanitizationReport(raw.sanitization),
  };
};
