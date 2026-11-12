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
    !/^(?:ru|en):(?:about|jobs\.(?:0|[1-9]\d{0,2})\.description)$/u.test(
      input.changeId ?? ''
    ) ||
    (input.changeId?.endsWith(':about')
      ? input.recordId !== undefined
      : typeof input.recordId !== 'string' ||
        !/^\d{1,100}$/u.test(input.recordId)) ||
    (input.targetId !== undefined &&
      !/^[a-zA-Z\d]{1,100}$/u.test(input.targetId))
  ) {
    throw cvPrepareFailure('options');
  }
  return {
    ...cvPrepareIdentity(input),
    fingerprint: input.fingerprint,
    changeId: input.changeId,
    ...(input.recordId ? { recordId: input.recordId } : {}),
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
const validReceipt = (raw) =>
  raw.version === 1 &&
  raw.providerSaved === false &&
  Number.isFinite(Date.parse(raw.startedAt)) &&
  Number.isFinite(Date.parse(raw.updatedAt));
const cancelledPreparation = (raw, input) => {
  const identity = cvPrepareIdentity(raw);
  if (
    !validReceipt(raw) ||
    raw.hash !== null ||
    raw.language !== null ||
    raw.code !== 'jobs-cv-cancelled' ||
    ['requestId', 'browserSlot'].some(
      (key) => input[key] !== undefined && input[key] !== identity[key]
    )
  ) {
    throw cvPrepareFailure('state');
  }
  return {
    preparation: {
      ...identity,
      version: 1,
      state: 'cancelled',
      providerSaved: false,
      hash: null,
      language: null,
      code: raw.code,
      startedAt: raw.startedAt,
      updatedAt: raw.updatedAt,
    },
  };
};
const preparedResult = (raw, input) => {
  const options = cvPrepareOptions(raw ?? {});
  if (
    !validReceipt(raw) ||
    !states.includes(raw.state) ||
    !['ru', 'en'].includes(raw.language) ||
    !raw.changeId.startsWith(`${raw.language}:`) ||
    (raw.code !== null && !/^jobs-[a-z\d-]+$/u.test(raw.code))
  ) {
    throw cvPrepareFailure('state');
  }
  if (
    [
      'requestId',
      'browserSlot',
      'fingerprint',
      'changeId',
      'targetId',
      'recordId',
    ].some((key) => input[key] !== undefined && input[key] !== options[key])
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
export const cvPrepareResult = (raw, input = {}) => {
  if (raw === null) {
    return { preparation: null };
  }
  return raw?.state === 'cancelled'
    ? cancelledPreparation(raw, input)
    : preparedResult(raw, input);
};

export const cvPrepareReply = (raw, input) => {
  if (
    !raw ||
    !Object.hasOwn(raw, 'preparation') ||
    Object.hasOwn(raw, 'cancellation')
  ) {
    throw cvPrepareFailure('state');
  }
  return cvPrepareResult(raw.preparation, input);
};
