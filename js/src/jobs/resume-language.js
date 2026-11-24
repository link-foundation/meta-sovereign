import { jobsFailure } from './options.js';

/** Portable historical evidence; a title alone never establishes CV language. */
export const resumeLanguageProof = (raw, entry) => {
  if (
    !raw ||
    !['ru', 'en'].includes(raw.language) ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/u.test(raw.exportId) ||
    !/^[a-f\d]{64}$/u.test(raw.sha256) ||
    typeof raw.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.capturedAt)) ||
    entry.updatedAt === null ||
    raw.updatedAt !== entry.updatedAt ||
    Date.parse(raw.capturedAt) < entry.updatedAt
  ) {
    throw jobsFailure(
      'resume-language',
      'Resume language evidence is invalid.'
    );
  }
  return {
    language: raw.language,
    exportId: raw.exportId,
    sha256: raw.sha256,
    capturedAt: raw.capturedAt,
    updatedAt: raw.updatedAt,
  };
};
