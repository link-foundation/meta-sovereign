import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { cvTranslationOptions } from '../jobs/cv-translation-record.js';
import { copyExperienceData } from './experience.js';

export const experiencePlanFailure = (reason) =>
  Object.assign(
    new Error('The experience translation plan was not confirmed.'),
    { code: `cv-experience-plan-${reason}` }
  );
export const experiencePlanKey = (id) =>
  `secret:cv-experience-plan:${resumeExportRequestId(id)}`;
const revision = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const experiencePlanRunning = (row) =>
  ['planning', 'translating'].includes(row?.phase);

export const experiencePlanOptions = (value) => {
  const input = copyExperienceData(value);
  const options = {
    requestId: resumeExportRequestId(input.requestId),
    hh: input.hh,
    linkedin: input.linkedin,
    to: input.to,
    asOf: input.asOf ?? new Date().toISOString().slice(0, 7),
    models: cvTranslationOptions({
      requestId: input.requestId,
      from: 'ru',
      to: 'en',
      texts: ['model check'],
      models: input.models,
    }).models,
  };
  if (
    !revision(options.hh) ||
    !revision(options.linkedin) ||
    !['hh', 'linkedin'].includes(options.to) ||
    !/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/u.test(options.asOf)
  ) {
    throw experiencePlanFailure('input');
  }
  return options;
};
export const newExperiencePlan = (requestId, options = null) => ({
  id: experiencePlanKey(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'planning' : 'stopped',
  createdAt: new Date().toISOString(),
  comparisons: [],
  code: null,
});
const validOptions = (row, requestId) =>
  row.options
    ? row.options.requestId === requestId &&
      JSON.stringify(experiencePlanOptions(row.options)) ===
        JSON.stringify(row.options)
    : row.phase === 'stopped' && row.comparisons.length === 0;
export const checkedExperiencePlanRecord = (row, requestId) => {
  if (
    !row ||
    row.id !== experiencePlanKey(requestId) ||
    row.version !== 1 ||
    row.requestId !== requestId ||
    !['planning', 'translating', 'completed', 'failed', 'stopped'].includes(
      row.phase
    ) ||
    !Array.isArray(row.comparisons) ||
    row.comparisons.length > 801 ||
    !Number.isFinite(Date.parse(row.createdAt)) ||
    (row.code !== null &&
      !/^cv-experience-plan-[a-z-]{1,40}$/u.test(row.code)) ||
    !validOptions(row, requestId)
  ) {
    throw experiencePlanFailure('record');
  }
  return row;
};
export const experiencePlanPhase = (row, active) =>
  !experiencePlanRunning(row)
    ? row.phase
    : active === null
      ? 'unknown'
      : active
        ? row.phase
        : 'interrupted';
