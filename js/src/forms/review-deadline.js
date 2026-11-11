/** Only an explicitly bounded owner-verification wait may suspend this clock. */
export const reviewDeadline = ({ milliseconds, now, timers, expired }) => {
  let remaining = milliseconds;
  let started;
  let timer;
  const arm = () => {
    started = now();
    timer = timers.setTimeout(expired, Math.max(1, remaining));
    timer.unref?.();
  };
  arm();
  return {
    pause: (maximum) => {
      remaining -= now() - started;
      timers.clearTimeout(timer);
      timer = timers.setTimeout(() => expired('form-captcha-timeout'), maximum);
      timer.unref?.();
      let resumed = false;
      return () => {
        if (!resumed) {
          resumed = true;
          timers.clearTimeout(timer);
          arm();
        }
      };
    },
    stop: () => timers.clearTimeout(timer),
  };
};
