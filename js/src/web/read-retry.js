// Retry reads for as long as their view is mounted. Never replay mutations.
// A slow request owns its slot until it settles; wake events cannot overlap it.
export const READ_RECOVERED_EVENT = 'ms-read-recovered';

export const createRetryingRead = (
  load,
  {
    accept,
    failed,
    clock = globalThis,
    target = globalThis,
    delays = [1000, 2000, 5000, 10000, 30000],
  }
) => {
  let stopped = false;
  let pending = null;
  let timer = null;
  let attempts = 0;
  const refresh = () => {
    if (stopped || pending) {
      return pending;
    }
    clock.clearTimeout(timer);
    timer = null;
    pending = Promise.resolve()
      .then(load)
      .then((value) => {
        if (!stopped) {
          attempts = 0;
          accept(value);
        }
      })
      .catch((error) => {
        if (!stopped) {
          failed(error);
          timer = clock.setTimeout(
            refresh,
            delays[Math.min(attempts++, delays.length - 1)]
          );
        }
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  const wake = (event) => {
    const recovered =
      event?.type === READ_RECOVERED_EVENT || event?.type === 'online';
    if (
      (timer !== null || recovered) &&
      target.document?.visibilityState !== 'hidden'
    ) {
      refresh();
    }
  };
  const signals = ['online', 'visibilitychange', READ_RECOVERED_EVENT];
  signals.forEach((name) => target.addEventListener?.(name, wake));
  return {
    refresh,
    stop: () => {
      stopped = true;
      clock.clearTimeout(timer);
      signals.forEach((name) => target.removeEventListener?.(name, wake));
    },
  };
};
