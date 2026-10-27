// One foreground read per open chat. Keep cached messages visible while
// loading or waiting, and stop retries as soon as the reader leaves.
const requestFor = (current) => ({
  chat: current.chat,
  ...(current.topic ? { topic: current.topic } : {}),
  limit: 50,
  priority: 'view',
});

export const watchChatHistory = ({
  api,
  current,
  patch,
  newest,
  delay,
  now = Date.now,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
}) => {
  let stopped = false;
  let timer = null;
  let tries = 0;
  const update = (change) => {
    if (!stopped) {
      patch(current.key, () => change);
    }
  };
  const schedule = (fn, ms) => {
    clearTimer(timer);
    timer = setTimer(fn, ms);
  };
  const read = async (foreground = true) => {
    if (stopped) {
      return;
    }
    if (foreground) {
      update({ initialLoading: true, retryAt: 0, retryCode: null });
    }
    try {
      const result = await api.telegramHistory(requestFor(current));
      if (!result || result.error) {
        throw result ?? { code: 'network' };
      }
      if (stopped) {
        return;
      }
      tries = 0;
      update({
        initialLoading: false,
        failed: false,
        backgroundLoading: Boolean(result.background),
        retryAt: 0,
        retryCode: null,
        complete: Boolean(result.complete),
      });
      // Always re-read the local page: a concurrent prefetch may have
      // stored it even when this request reports written: 0 / cached.
      await newest(current.key);
      if (!stopped && !result.complete) {
        // Renew foreground preference while this chat remains open.
        schedule(() => read(false), 30_000);
      }
    } catch (error) {
      if (stopped) {
        return;
      }
      const wait = delay(tries++, error?.retryAfter);
      update({
        initialLoading: false,
        retryAt: now() + wait,
        retryCode: error?.code ?? 'network',
      });
      schedule(() => read(), wait);
    }
  };
  read();
  return () => {
    stopped = true;
    clearTimer(timer);
  };
};
