import { browserName } from '../browser/policy.js';
import { jobsBrowserOptions, jobsFailure, jobsObject } from './options.js';

export const JOB_LOGIN_DURATION = 30 * 60 * 1000;
export const loginRequestId = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z\d_-]{1,100}$/u.test(value)) {
    throw jobsFailure('login-input', 'Use a unique login request ID.');
  }
  return value;
};
export const loginIdentity = (input = {}) => ({
  browserSlot: browserName(input.browserSlot ?? 'jobs'),
  ...(input.requestId === undefined
    ? {}
    : { requestId: loginRequestId(input.requestId) }),
});
export const loginOptions = (input) => {
  jobsObject(input);
  const durationMs = input.durationMs ?? JOB_LOGIN_DURATION;
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1000 ||
    durationMs > JOB_LOGIN_DURATION
  ) {
    throw jobsFailure(
      'login-input',
      'Choose a login duration of 1–1800 seconds.'
    );
  }
  return {
    ...jobsBrowserOptions(input),
    requestId: loginRequestId(input.requestId),
    durationMs,
  };
};
export const loginKey = (requestId) =>
  `jobs-login:${loginRequestId(requestId)}`;
export const loginLatestKey = (slot) =>
  `jobs-login-latest:${browserName(slot)}`;
const states = [
  'opening',
  'browser-open',
  'close-failed',
  'closed',
  'expired',
  'cancelled',
  'failed',
  'interrupted',
];
const validLoginTimes = (raw) => {
  const duration = Date.parse(raw.expiresAt) - Date.parse(raw.startedAt);
  return (
    typeof raw.startedAt === 'string' &&
    typeof raw.expiresAt === 'string' &&
    Number.isFinite(duration) &&
    duration >= 1000 &&
    duration <= JOB_LOGIN_DURATION
  );
};
const matchesIdentity = (raw, identity) =>
  (identity.browserSlot === undefined ||
    identity.browserSlot === raw.browserSlot) &&
  (identity.requestId === undefined || identity.requestId === raw.requestId);
export const loginResult = (raw, identity = {}) => {
  if (!raw) {
    return { login: null };
  }
  const { browserSlot, requestId } = loginIdentity(raw);
  if (
    !requestId ||
    raw.version !== 1 ||
    !states.includes(raw.state) ||
    typeof raw.active !== 'boolean' ||
    raw.manual !== true ||
    raw.authentication !== 'unverified' ||
    raw.active !==
      ['opening', 'browser-open', 'close-failed'].includes(raw.state) ||
    !validLoginTimes(raw) ||
    (raw.code !== null && !/^jobs-login-[a-z-]{1,40}$/u.test(raw.code)) ||
    !matchesIdentity(raw, identity)
  ) {
    throw jobsFailure(
      'login-state',
      'The saved login receipt was not confirmed.'
    );
  }
  return {
    login: {
      version: 1,
      browserSlot,
      requestId,
      state: raw.state,
      active: raw.active,
      manual: true,
      authentication: 'unverified',
      startedAt: raw.startedAt,
      expiresAt: raw.expiresAt,
      code: raw.code,
    },
  };
};
