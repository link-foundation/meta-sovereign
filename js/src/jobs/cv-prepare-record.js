import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { resumeHash } from './resume-list.js';
import { jobsFailure } from './options.js';

export const cvPrepareFailure = (code) =>
  jobsFailure(`cv-${code}`, 'Native CV preparation was not confirmed.');
export const cvPrepareIdentity = (input) => ({
  requestId: resumeExportRequestId(input.requestId),
  browserSlot: browserName(input.browserSlot ?? 'jobs'),
});
export const cvPrepareOptions = (input) => {
  if (
    !/^[a-f\d]{64}$/u.test(input.fingerprint ?? '') ||
    !/^(?:ru|en):about$/u.test(input.changeId ?? '') ||
    (input.targetId !== undefined &&
      !/^[a-zA-Z\d]{1,100}$/u.test(input.targetId))
  ) {
    throw cvPrepareFailure('options');
  }
  return {
    ...cvPrepareIdentity(input),
    fingerprint: input.fingerprint,
    changeId: input.changeId,
    ...(input.targetId ? { targetId: input.targetId } : {}),
  };
};
const states = [
  'starting',
  'opening',
  'preparing',
  'prepared',
  'failed',
  'uncertain',
  'interrupted',
];
const preparationHash = (raw) =>
  raw.hash === null && ['starting', 'failed', 'interrupted'].includes(raw.state)
    ? null
    : resumeHash(raw.hash);
const cancelledPreparation = (raw, input) => {
  const identity = cvPrepareIdentity(raw);
  if (
    raw.version !== 1 ||
    raw.providerSaved !== false ||
    !Number.isFinite(Date.parse(raw.updatedAt)) ||
    ['requestId', 'browserSlot'].some(
      (key) => input[key] !== undefined && input[key] !== identity[key]
    )
  ) {
    throw cvPrepareFailure('state');
  }
  return {
    preparation: null,
    cancellation: {
      ...identity,
      version: 1,
      state: 'cancelled',
      providerSaved: false,
      updatedAt: raw.updatedAt,
    },
  };
};
const validatePreparation = (raw) => {
  if (
    raw.version !== 1 ||
    !states.includes(raw.state) ||
    raw.providerSaved !== false ||
    !Number.isFinite(Date.parse(raw.startedAt)) ||
    !Number.isFinite(Date.parse(raw.updatedAt)) ||
    !['ru', 'en'].includes(raw.language) ||
    raw.changeId !== `${raw.language}:about` ||
    (raw.code !== null && !/^jobs-[a-z\d-]+$/u.test(raw.code))
  ) {
    throw cvPrepareFailure('state');
  }
};
export const cvPrepareResult = (raw, input = {}) => {
  if (raw === null) {
    return { preparation: null };
  }
  if (raw?.state === 'cancelled') {
    return cancelledPreparation(raw, input);
  }
  const options = cvPrepareOptions(raw ?? {});
  validatePreparation(raw);
  if (
    ['requestId', 'browserSlot', 'fingerprint', 'changeId', 'targetId'].some(
      (key) => input[key] !== undefined && input[key] !== options[key]
    )
  ) {
    throw cvPrepareFailure('state');
  }
  return {
    preparation: {
      ...options,
      version: 1,
      hash: preparationHash(raw),
      language: raw.language,
      state: raw.state,
      code: raw.code,
      providerSaved: false,
      startedAt: raw.startedAt,
      updatedAt: raw.updatedAt,
    },
  };
};

export const cvPrepareReply = (raw, input) => {
  if (!raw || !Object.hasOwn(raw, 'preparation')) {
    throw cvPrepareFailure('state');
  }
  if (raw?.cancellation) {
    if (raw.preparation !== null || raw.cancellation.state !== 'cancelled') {
      throw cvPrepareFailure('state');
    }
    return cvPrepareResult(raw.cancellation, input);
  }
  return cvPrepareResult(raw?.preparation ?? null, input);
};
