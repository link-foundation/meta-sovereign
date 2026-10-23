// Waits for a condition instead of sleeping a guessed time (R-Z6): a
// fixed sleep is too short on a loaded runner and too long everywhere else.
// Resolves with the first truthy value `check` returns; throws on timeout.

export const waitFor = async (
  check,
  { timeoutMs = 10_000, stepMs = 5, what = 'the condition' } = {}
) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, stepMs));
  }
};
