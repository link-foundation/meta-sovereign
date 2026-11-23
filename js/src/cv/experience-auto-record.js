import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { hhAcquisitionOptions } from './experience-hh-acquisition-options.js';
import { linkedinExportOptions } from './linkedin-experience-record.js';
import { experiencePlanSettings } from './experience-plan-record.js';
import { copyExperienceData } from './experience.js';

const phases = {
  'acquiring-hh': ['checking-cache', 'exporting'],
  'acquiring-linkedin': ['opening', 'waiting-login', 'reading'],
  planning: ['planning', 'translating'],
};
const terminal = ['completed', 'failed', 'stopped'];
export const experienceAutoRunning = (row) => Object.hasOwn(phases, row?.phase);
export const experienceAutoFailure = (reason) =>
  Object.assign(
    new Error('Automatic experience preparation did not complete.'),
    {
      code: `cv-experience-auto-${reason}`,
      status:
        { missing: 404, busy: 409, conflict: 409, stopped: 503 }[reason] ?? 400,
    }
  );
export const experienceAutoKey = (id) =>
  `secret:cv-experience-auto:${resumeExportRequestId(id)}`;
export const experienceAutoOptions = (value) => {
  const input = copyExperienceData(value);
  const settings = experiencePlanSettings(input);
  const { hash, browserSlot, refresh, headless } = hhAcquisitionOptions(input);
  const { url, language } = linkedinExportOptions(input);
  return {
    ...settings,
    hash,
    browserSlot,
    refresh,
    ...(headless === undefined ? {} : { headless }),
    url,
    language,
  };
};
export const experienceAutoChildId = (token, name) =>
  `cv-auto-${name}-${token}`;
const revision = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const checkpoints = (row) => {
  const { hh, linkedin, plan, phase } = row;
  if (
    (hh !== null && !revision(hh)) ||
    (linkedin !== null && (!revision(linkedin) || hh === null))
  ) {
    return false;
  }
  const stage = {
    'acquiring-hh': hh === null,
    'acquiring-linkedin': hh !== null && linkedin === null,
    planning: linkedin !== null,
    completed:
      linkedin !== null &&
      plan?.requestId === experienceAutoChildId(row.token, 'plan') &&
      revision(plan.fingerprint),
  };
  return (stage[phase] ?? true) && (phase === 'completed' || plan === null);
};
const validOptions = (row, requestId) =>
  row.options
    ? row.options.requestId === requestId &&
      /^[a-f0-9]{32}$/u.test(row.token) &&
      JSON.stringify(experienceAutoOptions(row.options)) ===
        JSON.stringify(row.options)
    : row.phase === 'stopped' &&
      row.token === null &&
      row.hh === null &&
      row.linkedin === null;
export const checkedExperienceAuto = (row, requestId) => {
  if (!row) {
    throw experienceAutoFailure('missing');
  }
  const running = experienceAutoRunning(row);
  if (
    row.id !== experienceAutoKey(requestId) ||
    row.version !== 1 ||
    row.requestId !== requestId ||
    (!running && !terminal.includes(row.phase)) ||
    !validOptions(row, requestId) ||
    (row.step !== null &&
      (!running || !phases[row.phase].includes(row.step))) ||
    (row.phase === 'failed'
      ? !/^(?:cv|jobs|assignment)-[a-z0-9-]{1,100}$/u.test(row.code)
      : row.code !== null) ||
    !checkpoints(row)
  ) {
    throw experienceAutoFailure('record');
  }
  return row;
};
export const experienceAutoView = (
  { id: _id, version: _version, token: _token, ...row },
  active
) =>
  experienceAutoRunning(row) && !active
    ? {
        ...row,
        lastPhase: row.phase,
        phase: active === null ? 'unknown' : 'interrupted',
        code: experienceAutoFailure(
          active === null ? 'ownership-unverified' : 'interrupted'
        ).code,
      }
    : row;
