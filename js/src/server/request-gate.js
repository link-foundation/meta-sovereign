// The private backend accepts traffic only from its stable loopback front.
// Draining waits for request handlers, not long-lived SSE response streams.
import { json } from './util.js';
import { setTimeout, clearTimeout } from 'node:timers';

export const createRequestGate = (dispatch, front = {}) => {
  let accepting = !front.warming;
  let active = 0;
  const waiters = new Set();
  const authorize = (req) => {
    if (front.token && req.headers['x-meta-sovereign-front'] !== front.token) {
      return false;
    }
    if (front.token) {
      req.socket.encrypted = req.headers['x-meta-sovereign-secure'] === '1';
    }
    return true;
  };
  return {
    authorize,
    activate: () => {
      accepting = true;
    },
    async handle(req, res) {
      if (!authorize(req)) {
        return json(res, 403, {
          code: 'private-backend',
          error: 'private backend',
        });
      }
      if (!accepting && req.url?.split('?')[0] !== '/api/health') {
        return json(res, 503, {
          code: 'server-starting',
          error: 'server is preparing',
        });
      }
      active += 1;
      try {
        return await dispatch(req, res);
      } finally {
        active -= 1;
        if (!active) {
          waiters.forEach((done) => done());
          waiters.clear();
        }
      }
    },
    drain: ({ timeoutMs = 5000 } = {}) => {
      accepting = false;
      if (!active) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          waiters.delete(done);
          accepting = true;
          reject(
            Object.assign(
              new Error(
                'requests are still in flight; the current server remains active'
              ),
              { code: 'SERVER_BUSY' }
            )
          );
        }, timeoutMs);
        waiters.add(done);
      });
    },
  };
};
