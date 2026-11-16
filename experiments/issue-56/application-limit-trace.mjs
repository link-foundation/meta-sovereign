/** Opt-in timings only: no paths, records, provider values or exception text. */
export const applicationLimitTrace = () => {
  const enabled = process.env.MS_APPLICATION_LIMIT_DEBUG === '1';
  let sequence = 0;
  return async (phase, work) => {
    if (!enabled) {
      return work();
    }
    const id = ++sequence;
    const started = globalThis.performance.now();
    const emit = (event) => {
      if (id <= 64) {
        console.debug(
          '[application-limit-store]',
          JSON.stringify({
            id,
            phase,
            event,
            elapsedMs: globalThis.performance.now() - started,
          })
        );
      }
    };
    emit('started');
    try {
      const value = await work();
      emit('completed');
      return value;
    } catch (error) {
      emit('failed');
      throw error;
    }
  };
};

export const tracedLimitStore = (store, trace) => ({
  ...store,
  ...Object.fromEntries(
    ['put', 'flush', 'close'].map((operation) => [
      operation,
      (...args) => trace(`store-${operation}`, () => store[operation](...args)),
    ])
  ),
});
