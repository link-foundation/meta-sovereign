// Own short-lived authorization clients, including pending SDK callbacks.
// Never log API credentials, phone numbers, codes, tokens or sessions.
export const loginError = (code, message) =>
  Object.assign(new Error(message), { code, status: 400 });

export const deferredLoginInput = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Cancellation may precede the SDK awaiting an input callback.
  promise.catch(() => {});
  return { promise, resolve, reject };
};

export const createLoginLifetime = (
  client,
  { timeoutMs = 300_000, onStop = () => {}, debug = false, log } = {}
) => {
  let stopped = null;
  let closing = null;
  let timer = null;
  const aborted = deferredLoginInput();
  const trace = (phase) => {
    if (debug) {
      log?.({ event: 'telegram_login_lifecycle', phase });
    }
  };
  const check = () => {
    if (stopped) {
      throw stopped;
    }
  };
  const close = () => {
    globalThis.clearTimeout(timer);
    closing ??= Promise.resolve()
      .then(() => (client.destroy ?? client.disconnect)?.call(client))
      .finally(() => trace('closed'));
    return closing;
  };
  const stop = (error = loginError('LOGIN_CANCELLED', 'login cancelled')) => {
    if (!stopped) {
      stopped = error;
      trace(error.code === 'LOGIN_TIMEOUT' ? 'timeout' : 'cancelled');
      onStop(error);
      aborted.reject(error);
    }
    return close();
  };
  timer = globalThis.setTimeout(() => {
    stop(loginError('LOGIN_TIMEOUT', 'Telegram login timed out')).catch(
      () => {}
    );
  }, timeoutMs);
  timer.unref?.();
  trace('created');
  return {
    check,
    close,
    stop,
    get stopped() {
      return stopped;
    },
    run: (task) => {
      check();
      // Both branches remain observed if an SDK ignores destruction and
      // completes late. Callers check ownership again before publishing.
      return Promise.race([
        Promise.resolve().then(() => {
          check();
          return task();
        }),
        aborted.promise,
      ]);
    },
  };
};

export const waitForLogin = async (ctrl, lifetime, want, pollMs = 25) => {
  const deadline = Date.now() + 60_000;
  while (ctrl.state === want && !ctrl.error) {
    if (Date.now() >= deadline) {
      await lifetime.stop(
        loginError('LOGIN_TIMEOUT', 'Telegram login step timed out')
      );
      break;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, pollMs));
  }
  if (lifetime.stopped) {
    await lifetime.close();
    throw lifetime.stopped;
  }
  if (ctrl.error) {
    const error = ctrl.error;
    ctrl.error = null;
    throw error;
  }
  return ctrl.state;
};
