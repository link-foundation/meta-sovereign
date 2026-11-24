import http from 'node:http';
import net from 'node:net';
import { relayWorkerRequest } from './worker-request.js';
import { applyCors, hostAllowed, parseAllowedOrigins } from './cors-policy.js';
import { withHostedOrigin } from './hosted-ui.js';

// Healthy proxy traffic forwards bytes without consuming the error codec.
// Observe lazy-load failures too: an HTTP listener cannot leave a rejected
// callback promise or an unanswered socket behind.
const proxyFailure = async (res, status, body) => {
  try {
    const { json } = await import('./util.js');
    json(res, status, body);
  } catch {
    res.destroy();
  }
};

const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'http2-settings',
]);
const cleanHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !name.startsWith(':') &&
        !HOP.has(name.toLowerCase()) &&
        !name.startsWith('x-meta-sovereign-')
    )
  );
const allowedOrigins = (options) => {
  const allowed = parseAllowedOrigins(options.allowOrigins);
  return options.uiUrl && allowed.length
    ? withHostedOrigin(allowed, options.uiUrl)
    : allowed;
};
const backendHeaders = (req, token) => ({
  ...cleanHeaders(req.headers),
  host: req.headers.host,
  'x-meta-sovereign-front': token,
  'x-meta-sovereign-secure': req.socket.encrypted ? '1' : '0',
});

export const createWorkerProxy = ({
  target,
  port,
  options = {},
  log = () => {},
}) => {
  const agent = new http.Agent({ keepAlive: true });
  let allowed = allowedOrigins(options);
  const server = http.createServer(
    { requestTimeout: 30 * 60_000 },
    async (req, res) => {
      if (!hostAllowed(req, port())) {
        return proxyFailure(res, 421, {
          code: 'bad-host',
          error: 'unexpected Host header',
        });
      }
      if (
        applyCors(req, res, allowed, (response, status, code, error) => {
          void proxyFailure(response, status, { code, error });
        })
      ) {
        return;
      }
      const abort = new AbortController();
      res.once('close', () => abort.abort());
      try {
        await relayWorkerRequest({
          req,
          res,
          target,
          agent,
          headers: backendHeaders,
          cleanHeaders,
          signal: abort.signal,
          log,
        });
      } catch {
        if (res.headersSent) {
          res.destroy();
        } else if (!res.destroyed) {
          await proxyFailure(res, 502, {
            code: 'network',
            error: 'local worker is reconnecting',
          });
        }
      }
    }
  );
  server.on('upgrade', async (req, socket, head) => {
    if (!hostAllowed(req, port())) {
      socket.destroy();
      return;
    }
    // The backend checks the same Origin policy before accepting the upgrade.
    try {
      const worker = await target();
      if (socket.destroyed) {
        return;
      }
      const upstream = net.connect(worker.port, '127.0.0.1', () => {
        const headers = {
          ...backendHeaders(req, worker.token),
          connection: 'Upgrade',
          upgrade: req.headers.upgrade,
        };
        upstream.write(
          `${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\r\n')}\r\n\r\n`
        );
        if (head.length) {
          upstream.write(head);
        }
        socket.pipe(upstream).pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      socket.once('close', () => upstream.destroy());
    } catch {
      socket.destroy();
    }
  });
  return {
    server,
    configure: (next) => {
      allowed = allowedOrigins(next);
    },
    close: () => agent.destroy(),
  };
};
