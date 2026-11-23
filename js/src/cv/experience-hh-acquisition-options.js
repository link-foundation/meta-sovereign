import { jobsBrowserOptions } from '../jobs/options.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { resumeHash } from '../jobs/resume-list.js';

export const hhAcquisitionFailure = (reason) =>
  Object.assign(
    new Error('The HeadHunter experience export was not confirmed.'),
    {
      code: `cv-hh-acquisition-${reason}`,
      status:
        { missing: 404, busy: 409, conflict: 409, stopped: 503 }[reason] ?? 400,
    }
  );
export const hhAcquisitionOptions = (input) => {
  const { browserSlot, headless } = jobsBrowserOptions(input);
  if (input.refresh !== undefined && typeof input.refresh !== 'boolean') {
    throw hhAcquisitionFailure('input');
  }
  return {
    requestId: resumeExportRequestId(input.requestId),
    hash:
      input.hash === null || input.hash === undefined
        ? null
        : resumeHash(input.hash),
    browserSlot,
    refresh: input.refresh === true,
    ...(headless === undefined ? {} : { headless }),
  };
};
