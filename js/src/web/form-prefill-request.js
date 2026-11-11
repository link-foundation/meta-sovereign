import { pendingPrefill, CAPTCHA_WAIT_MS } from '../forms/challenge-wait.js';
const states = new Set([
  'prefilled',
  'partial',
  'uncertain',
  'refused',
  'waiting-owner',
  'prefilling',
]);
const failure = (code) => Object.assign(new Error(code), { code });
const validPending = (value) => {
  if (!pendingPrefill(value)) {
    return true;
  }
  const elapsed =
    Date.parse(value.wait?.expiresAt) - Date.parse(value.wait?.startedAt);
  return (
    !value.ok &&
    !value.complete &&
    value.wait?.kind === 'captcha' &&
    elapsed > 0 &&
    elapsed <= CAPTCHA_WAIT_MS
  );
};

const validShape = (value) =>
  value?.mode === 'prefill-result' &&
  states.has(value.state) &&
  ['receipts', 'uploads', 'unresolved'].every((key) =>
    Array.isArray(value[key])
  ) &&
  ['ok', 'complete'].every((key) => typeof value[key] === 'boolean') &&
  value.requiresReview === true &&
  value.submissionAttempted === false;
const validCompletion = (value) =>
  value.state !== 'prefilled' ||
  (value.ok && value.complete && Array.isArray(value.report?.fields));

/** Retain one frozen request until the owned server returns its matching receipt. */
export const createFormPrefillRequest = (api) => {
  let pending;
  let running = false;
  const receive = (value) => {
    if (
      !validShape(value) ||
      value.requestId !== pending.requestId ||
      value.reviewSession?.id !== pending.id ||
      !validPending(value) ||
      !validCompletion(value)
    ) {
      throw failure(value?.code ?? 'form-prefill-unknown');
    }
    if (!pendingPrefill(value)) {
      pending = null;
    }
    return value;
  };
  return {
    pending: () => Boolean(pending),
    async status() {
      if (!pending || running) {
        throw failure('form-prefill-pending');
      }
      running = true;
      try {
        return receive(
          await api.formsPrefillStatus({
            id: pending.id,
            requestId: pending.requestId,
          })
        );
      } finally {
        running = false;
      }
    },
    async run(input) {
      if (running) {
        throw failure('form-busy');
      }
      if (pending && pending.id !== input.id) {
        throw failure('form-prefill-pending');
      }
      pending ??= globalThis.structuredClone({
        ...input,
        requestId: globalThis.crypto.randomUUID(),
      });
      running = true;
      try {
        return receive(await api.formsPrefillReview(pending));
      } finally {
        running = false;
      }
    },
  };
};
