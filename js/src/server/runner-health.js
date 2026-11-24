import http from 'node:http';
import { setTimeout, clearTimeout } from 'node:timers';
import { decodeWire, LINO_TEXT, mediaType } from '../transport/lino.js';
import { requestServerControl } from './rolling-control.js';

/** One bounded request to the already owned worker, without provider reads. */
export const probeRunnerWorker = (worker, { port, tls } = {}) =>
  new Promise((resolve) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);
    let settled = false;
    const finish = (state) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(state);
    };
    let request;
    try {
      request = http.get(
        {
          hostname: '127.0.0.1',
          port: worker.port,
          path: '/api/health',
          signal: abort.signal,
          agent: false,
          headers: {
            accept: LINO_TEXT,
            host: `127.0.0.1:${port}`,
            'x-meta-sovereign-front': worker.token,
            'x-meta-sovereign-secure': tls ? '1' : '0',
          },
        },
        (response) => {
          let length = 0;
          const chunks = [];
          response.on('error', () => finish('unknown'));
          response.on('data', (chunk) => {
            length += chunk.length;
            if (length > 16384) {
              request.destroy();
              finish('unknown');
            } else {
              chunks.push(chunk);
            }
          });
          response.on('end', () => {
            try {
              if (mediaType(response.headers['content-type']) !== LINO_TEXT) {
                return finish('unknown');
              }
              const value = decodeWire(Buffer.concat(chunks), LINO_TEXT);
              if (
                response.statusCode === 423 &&
                value.service === 'meta-sovereign' &&
                value.code === 'locked'
              ) {
                return finish('locked');
              }
              return finish(
                response.statusCode === 200 &&
                  value.ok === true &&
                  typeof value.store?.degraded === 'boolean'
                  ? value.store.degraded
                    ? 'degraded'
                    : 'ready'
                  : 'unknown'
              );
            } catch {
              return finish('unknown');
            }
          });
        }
      );
      request.on('error', () => finish('unknown'));
    } catch {
      finish('unknown');
    }
  });

/** Never infer health from stale metadata or another service on a public port. */
export const readRunnerHealth = async (store, { signal } = {}) => {
  let state = 'unknown';
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 2500);
  const owned = signal
    ? globalThis.AbortSignal.any([signal, deadline.signal])
    : deadline.signal;
  try {
    const value = await requestServerControl(
      store,
      { operation: 'health' },
      { timeoutMs: 2500, signal: owned }
    );
    if (
      !owned.aborted &&
      ['ready', 'locked', 'degraded'].includes(value?.state)
    ) {
      state = value.state;
    }
  } catch {
    // Socket absence, old hosts, timeout and cancellation are unconfirmed.
  } finally {
    clearTimeout(timer);
  }
  return { ok: state !== 'unknown', scope: 'application-worker', state };
};
