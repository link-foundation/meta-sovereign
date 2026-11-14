import { browserName } from '../browser/policy.js';
import { readResumeExportFile } from './resume-export-files.js';
import { resumeExportResult } from './resume-export-result.js';
import { technologyFailure } from './technology-catalog.js';

/** The bytes, receipt identity and selected browser slot must agree. */
export const verifiedTechnologyCv = async ({ store, artifactRoot }, input) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  const file = await readResumeExportFile(
    { store, artifactRoot },
    { ...input, name: 'resume.json' }
  );
  const receipt = resumeExportResult(
    await store.get(`jobs-resume-artifact:${input.exportId}:${input.hash}`)
  );
  const cv = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)
  );
  if (
    receipt.browserSlot !== browserSlot ||
    cv.language !== receipt.language ||
    cv.title !== receipt.title
  ) {
    throw technologyFailure('resume');
  }
  return {
    cv,
    identity: {
      exportId: receipt.exportId,
      hash: receipt.hash,
      browserSlot,
      title: receipt.title,
      language: receipt.language,
      capturedAt: receipt.capturedAt,
      sha256: file.sha256,
    },
  };
};
