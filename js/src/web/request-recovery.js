// All server-backed reads retain one pending request and recover automatically.
// Polling callers share that attempt; each receives its own response body.
import { READ_RECOVERED_EVENT } from './read-retry.js';
import { retryableReadResponse, retryableReadData } from './request-policy.js';

const decodedResponse = async (response, body, progress) => {
  // Deadlines measure inactivity. A large, healthy download can take longer
  // than one deadline while continuing to deliver bytes.
  const reader =
    response.body?.pipeThrough && globalThis.TransformStream
      ? new globalThis.Response(
          response.body.pipeThrough(
            new globalThis.TransformStream({
              transform: (chunk, output) => {
                progress();
                output.enqueue(chunk);
              },
            })
          ),
          { headers: response.headers }
        )
      : response;
  const data = [204, 205].includes(response.status)
    ? null
    : await reader[body]().catch((error) => {
        if (response.ok) {
          throw error;
        }
        return null;
      });
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    data,
    [body]: async () => data,
  };
};

const requestScope = (signals, clock, timeoutMs = 0) => {
  const controller = new AbortController();
  const inputs = [...signals, controller.signal].filter(Boolean);
  const callbacks = [];
  let timer = null;
  const renew = () => {
    clock.clearTimeout(timer);
    if (timeoutMs && !controller.signal.aborted) {
      timer = clock.setTimeout(() => {
        controller.abort(
          Object.assign(new Error('request deadline'), { name: 'TimeoutError' })
        );
      }, timeoutMs);
    }
  };
  renew();
  let signal;
  if (globalThis.AbortSignal?.any) {
    signal = globalThis.AbortSignal.any(inputs);
  } else {
    for (const input of signals.filter(Boolean)) {
      const abort = () => controller.abort(input.reason);
      if (input.aborted) {
        abort();
      } else {
        input.addEventListener('abort', abort, { once: true });
        callbacks.push(() => input.removeEventListener('abort', abort));
      }
    }
    signal = controller.signal;
  }
  return {
    signal,
    renew,
    close: () => {
      clock.clearTimeout(timer);
      callbacks.forEach((close) => close());
    },
  };
};

const waitForRetry = (ms, signal, target, clock) =>
  new Promise((resolve, reject) => {
    const clean = () => {
      clock.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      target.removeEventListener?.('online', wake);
      target.removeEventListener?.(READ_RECOVERED_EVENT, wake);
    };
    const wake = () => {
      clean();
      resolve();
    };
    const abort = () => {
      clean();
      reject(signal.reason);
    };
    const timer = clock.setTimeout(wake, ms);
    signal.addEventListener('abort', abort, { once: true });
    target.addEventListener?.('online', wake);
    target.addEventListener?.(READ_RECOVERED_EVENT, wake);
    if (signal.aborted) {
      abort();
    }
  });

export const createRecoveringRequest = ({
  fetchImpl,
  reached = () => {},
  failed = () => {},
  target = globalThis,
  clock = globalThis,
  delays = [1000, 2000, 5000, 10000, 30000],
  timeoutMs = 30000,
}) => {
  const lifetime = new AbortController();
  const pending = new Map();
  const run = async (url, init, retry, body) => {
    const scope = requestScope([init.signal, lifetime.signal], clock);
    const { signal } = scope;
    let attempts = 0;
    try {
      while (!signal.aborted) {
        const attempt = requestScope([signal], clock, timeoutMs);
        try {
          const response = await fetchImpl(url, {
            ...init,
            signal: attempt.signal,
          });
          reached();
          attempt.renew();
          if (!retry || !(await retryableReadResponse(response))) {
            const result = body
              ? await decodedResponse(response, body, attempt.renew)
              : response;
            if (!retry || body !== 'json' || !retryableReadData(result.data)) {
              return result;
            }
          }
        } catch (error) {
          if (signal.aborted) {
            throw signal.reason;
          }
          Promise.resolve(failed(error)).catch(() => {});
          if (!retry) {
            throw error;
          }
        } finally {
          attempt.close();
        }
        await waitForRetry(
          delays[Math.min(attempts++, delays.length - 1)],
          signal,
          target,
          clock
        );
      }
      throw signal.reason;
    } finally {
      scope.close();
    }
  };
  return {
    request: async (
      url,
      init = {},
      { retry = false, json = false, body = json ? 'json' : null } = {}
    ) => {
      if (!retry || init.signal) {
        return run(url, init, retry, body);
      }
      const key = JSON.stringify([
        url,
        init.method ?? 'GET',
        init.headers,
        init.body,
        body,
      ]);
      let work = pending.get(key);
      if (!work) {
        work = run(url, init, true, body).finally(() => pending.delete(key));
        pending.set(key, work);
      }
      const response = await work;
      return response.clone?.() ?? response;
    },
    stop: () => {
      lifetime.abort();
      pending.clear();
    },
  };
};
