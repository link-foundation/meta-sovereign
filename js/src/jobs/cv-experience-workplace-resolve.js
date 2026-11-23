import { cvPrepareFailure } from './cv-prepare-record.js';
import { readCvSavedWorkplaceIds } from './cv-workplace-created.js';
import { cvWorkplacePlanJob } from './cv-workplace-plan.js';
import { readCvSavedWorkplace } from './cv-workplace-readback.js';
import { cvWorkplaceMatchesJob } from './cv-watch-verification.js';

/** Bind an approved baseline to one saved record before opening any editor. */
export const resolveHhExperienceWorkplace = async ({
  session,
  change,
  check,
  readIds = readCvSavedWorkplaceIds,
  readWorkplace = readCvSavedWorkplace,
  now = Date.now,
}) => {
  if (change.plan.operation === 'add' || change.workplace.recordId !== null) {
    return change;
  }
  const { plan, hash } = change;
  const url = session.page.url();
  const deadline = now() + 30000;
  const confirm = () => {
    check();
    if (session.page.url() !== url || now() >= deadline) {
      throw cvPrepareFailure('baseline');
    }
  };
  const ids = await readIds({ session, check: confirm });
  let matched;
  for (const recordId of ids) {
    const record = await readWorkplace({
      session,
      attempt: { recordId },
      check: confirm,
    });
    const target = record.resumes.filter(({ checked }) => checked);
    if (!target.some((resume) => resume.hash === hash)) {
      continue;
    }
    const expected = cvWorkplacePlanJob(plan, 'baseline', record.locale);
    if (!cvWorkplaceMatchesJob(record, expected, expected.industries)) {
      continue;
    }
    if (matched) {
      throw cvPrepareFailure('experience-record-ambiguous');
    }
    matched = { recordId, shared: target.length !== 1 };
  }
  confirm();
  if (!matched || matched.shared) {
    throw cvPrepareFailure(matched ? 'shared' : 'baseline');
  }
  return {
    ...change,
    workplace: { ...change.workplace, recordId: matched.recordId },
  };
};
