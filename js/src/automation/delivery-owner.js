/** Cancellation before the provider call is a definite refusal, never uncertainty. */
export const requireDeliveryOwner = (signal) => {
  if (signal?.aborted) {
    throw Object.assign(new Error('Automation stopped before delivery'), {
      code: 'stopped',
      definitive: true,
      fallback: false,
    });
  }
};
