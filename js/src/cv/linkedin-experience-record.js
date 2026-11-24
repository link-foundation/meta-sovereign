import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { copyExperienceData } from './experience.js';
import { linkedinExperienceUrl } from './linkedin-experience-parse.js';

export const linkedinExportFailure = (reason) =>
  Object.assign(
    new Error('The native LinkedIn experience export was not confirmed.'),
    { code: `cv-linkedin-${reason}` }
  );
export const linkedinExportKey = (id) =>
  `secret:cv-linkedin-export:${resumeExportRequestId(id)}`;
export const linkedinExportRunning = (row) =>
  ['opening', 'waiting-login', 'reading'].includes(row.phase);
export const linkedinExportOptions = (input) => {
  const options = {
    requestId: resumeExportRequestId(input.requestId),
    url: linkedinExperienceUrl(input.url),
    language: input.language ?? 'en',
  };
  if (!['en', 'ru'].includes(options.language)) {
    throw linkedinExportFailure('input');
  }
  return options;
};
const validFiles = (files) =>
  Array.isArray(files) &&
  files.length <= 4 &&
  new Set(files.map((file) => file?.name)).size === files.length &&
  files.every(
    (file) =>
      file &&
      [
        'linkedin-experience.txt',
        'linkedin-experience.json',
        'experience.lino',
        'experience.bin',
      ].includes(file.name) &&
      Number.isSafeInteger(file.size) &&
      file.size >= 0 &&
      file.size <= 4 * 1024 * 1024 &&
      /^[a-f0-9]{64}$/u.test(file.sha256)
  );
const checkProgress = (row) => {
  if (
    (row.phase === 'completed' && (!row.revision || row.files.length !== 4)) ||
    (!row.options && row.phase !== 'stopped') ||
    (row.headless !== undefined && typeof row.headless !== 'boolean') ||
    ![row.positions, row.passes].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 200
    )
  ) {
    throw linkedinExportFailure('record');
  }
};
export const checkedLinkedinExport = (input, id) => {
  const row = copyExperienceData(input);
  if (
    !row ||
    row.id !== linkedinExportKey(id) ||
    row.requestId !== id ||
    row.version !== 1 ||
    ![
      'opening',
      'waiting-login',
      'reading',
      'completed',
      'stopped',
      'failed',
      'interrupted',
    ].includes(row.phase) ||
    (row.revision !== null && !/^[a-f0-9]{64}$/u.test(row.revision)) ||
    !validFiles(row.files)
  ) {
    throw linkedinExportFailure('record');
  }
  if (
    row.options &&
    (row.options.requestId !== id ||
      JSON.stringify(linkedinExportOptions(row.options)) !==
        JSON.stringify(row.options))
  ) {
    throw linkedinExportFailure('record');
  }
  checkProgress(row);
  return row;
};
export const linkedinExportView = (row, active) => {
  const { id: _id, version: _version, ...result } = row;
  if (linkedinExportRunning(row) && active === null) {
    return {
      ...result,
      phase: 'unknown',
      lastPhase: row.phase,
      code: 'cv-linkedin-ownership-unverified',
    };
  }
  return linkedinExportRunning(row) && !active
    ? { ...result, phase: 'interrupted', code: 'cv-linkedin-interrupted' }
    : result;
};
export const newLinkedinExport = (requestId, options = null) => ({
  id: linkedinExportKey(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'opening' : 'stopped',
  revision: null,
  files: [],
  code: null,
  positions: 0,
  passes: 0,
});
