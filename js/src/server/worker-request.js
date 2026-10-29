import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

// Only safe reads may be replayed by the front. Mutations retain their client
// idempotency key and are retried by the durable client outbox instead.
const isRead = (req) => ['GET', 'HEAD'].includes(req.method);
const forward = ({ req, res, worker, agent, headers, cleanHeaders }) =>
  new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        hostname: '127.0.0.1',
        port: worker.port,
        path: req.url,
        method: req.method,
        headers: headers(req, worker.token),
        agent,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode, cleanHeaders(upstream.headers));
        upstream.on('error', () => res.destroy());
        upstream.pipe(res);
        resolve();
      }
    );
    const cancel = () => outgoing.destroy();
    res.once('close', cancel);
    outgoing.once('close', () => res.removeListener('close', cancel));
    outgoing.on('error', reject);
    if (isRead(req)) {
      outgoing.end();
    } else {
      req.pipe(outgoing);
    }
  });

export const relayWorkerRequest = async ({
  req,
  res,
  target,
  agent,
  headers,
  cleanHeaders,
  signal,
  log,
}) => {
  let retries = 0;
  while (!signal.aborted) {
    const worker = await target(signal);
    if (signal.aborted) {
      return;
    }
    try {
      await forward({ req, res, worker, agent, headers, cleanHeaders });
      return;
    } catch (error) {
      if (signal.aborted || res.destroyed) {
        return; // A page cancelling its own request is not a worker outage.
      }
      log({
        level: 'debug',
        event: 'worker_request_interrupted',
        code: error.code,
        method: req.method,
        path: new URL(req.url, 'http://local').pathname,
      });
      if (!isRead(req) || res.headersSent || res.destroyed) {
        throw error;
      }
      retries += 1;
      await sleep(Math.min(1000, retries * 50), undefined, { signal });
    }
  }
};
