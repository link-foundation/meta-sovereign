const fail = (code) => Object.assign(new Error(code), { code });
const integer = (value, fallback, min, max) => {
  const n = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw fail('bad-request');
  }
  return n;
};

export const followRetryPolicy = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw fail('bad-request');
  }
  const policy = {
    attempts: integer(input.attempts, 3, 1, 10),
    delayMs: integer(input.delayMs, 100, 0, 60000),
    maxDelayMs: integer(input.maxDelayMs, 2000, 0, 300000),
  };
  if (policy.maxDelayMs < policy.delayMs) {
    throw fail('bad-request');
  }
  return policy;
};

// Provider refusals (including flood waits) are never timeout retries. Do not
// infer a timeout from an arbitrary error message containing private content.
export const followTimeout = (error) =>
  error?.vkCode === undefined &&
  (!error?.errorMessage || error.errorMessage === 'TIMEOUT') &&
  (['timeout', 'ETIMEDOUT', 'TIMEOUT'].includes(error?.code) ||
    error?.name === 'TimeoutError' ||
    error?.errorMessage === 'TIMEOUT');

const pause = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));
const repeatable = (error, write, idempotent) =>
  followTimeout(error) && (!write || idempotent || error?.safeToRetry === true);

// An ambiguous write needs either a stable provider idempotency key or a
// positive refusal before it can be repeated. The caller owns the entire RPC;
// this helper never races it against a timer and abandons a late result.
export const withFollowRetry = async (
  use,
  {
    policy: input,
    write = false,
    idempotent = false,
    sleep = pause,
    cancelled = () => false,
    trace = () => {},
  } = {}
) => {
  const policy = followRetryPolicy(input);
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    if (cancelled()) {
      throw fail('cancelled');
    }
    try {
      return await use(attempt);
    } catch (error) {
      if (
        !repeatable(error, write, idempotent) ||
        attempt === policy.attempts
      ) {
        throw error;
      }
      const delayMs = Math.min(
        policy.maxDelayMs,
        policy.delayMs * 2 ** (attempt - 1)
      );
      trace({ event: 'follow_timeout_retry', attempt, delayMs });
      if (cancelled()) {
        throw fail('cancelled');
      }
      await sleep(delayMs);
    }
  }
};
