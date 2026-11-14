/** Only an explicitly bounded owner-verification wait may suspend this clock. */
export const reviewDeadline = ({
  milliseconds,
  now,
  timers,
  expired,
  trace,
}) => {
  let remaining = milliseconds;
  let started;
  let timer;
  const emit = (phase, detail = {}) => {
    try {
      trace?.({
        event: 'form-review-deadline',
        phase,
        remainingMs: remaining,
        ...detail,
      });
    } catch {
      // Optional count/time diagnostics must not change lifetime ownership.
    }
  };
  const expire = (code) => {
    emit('expired', { code: code ?? 'form-timeout' });
    expired(code);
  };
  const arm = () => {
    started = now();
    timer = timers.setTimeout(() => expire(), Math.max(1, remaining));
    timer.unref?.();
  };
  arm();
  emit('started');
  return {
    pause: (maximum) => {
      remaining -= now() - started;
      timers.clearTimeout(timer);
      timer = timers.setTimeout(() => expire('form-captcha-timeout'), maximum);
      timer.unref?.();
      emit('paused', { maximumMs: maximum });
      let resumed = false;
      return () => {
        if (!resumed) {
          resumed = true;
          timers.clearTimeout(timer);
          arm();
          emit('resumed');
        }
      };
    },
    stop: () => {
      timers.clearTimeout(timer);
      emit('stopped');
    },
  };
};
