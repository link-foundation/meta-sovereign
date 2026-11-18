import { followRetryPolicy } from './retry.js';

const number = (value) => {
  if (value === undefined || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  throw Object.assign(new Error('bad-request'), { code: 'bad-request' });
};
// Nested policies are typed API values. Flat query/CLI fields accept digits.
export const followReadPolicy = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('bad-request'), { code: 'bad-request' });
  }
  return followRetryPolicy(
    input.retry === undefined
      ? {
          attempts: number(input.attempts),
          delayMs: number(input.retryDelayMs),
          maxDelayMs: number(input.retryMaxDelayMs),
        }
      : input.retry
  );
};

export const followReadCliPolicy = (args) =>
  followReadPolicy({
    attempts: args.attempts,
    retryDelayMs: args['retry-delay-ms'],
    retryMaxDelayMs: args['retry-max-delay-ms'],
  });

export const followReadQuery = (input = {}) => {
  const { retry: _retry, ...fields } = input;
  const retry = followReadPolicy(input);
  return new URLSearchParams({
    ...fields,
    attempts: retry.attempts,
    retryDelayMs: retry.delayMs,
    retryMaxDelayMs: retry.maxDelayMs,
  });
};

export const followReadWait = (ms, signal) =>
  new Promise((resolve) => {
    const done = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = globalThis.setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    if (signal?.aborted) {
      done();
    }
  });
