const states = new Set(['prefilled', 'partial', 'uncertain', 'refused']);
const failure = (code) => Object.assign(new Error(code), { code });

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
  return {
    pending: () => Boolean(pending),
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
        const value = await api.formsPrefillReview(pending);
        if (
          !validShape(value) ||
          value.requestId !== pending.requestId ||
          value.reviewSession?.id !== pending.id ||
          !validCompletion(value)
        ) {
          throw failure(value?.code ?? 'form-prefill-unknown');
        }
        pending = null;
        return value;
      } finally {
        running = false;
      }
    },
  };
};
