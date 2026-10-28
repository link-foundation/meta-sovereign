import http from 'node:http';
import net from 'node:net';
import { relayWorkerRequest } from './worker-request.js';
import { handleCors, hostAllowed, parseAllowedOrigins } from './cors.js';
import { withHostedOrigin } from './hosted-ui.js';
import { json } from './util.js';

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
        return json(res, 421, {
          code: 'bad-host',
          error: 'unexpected Host header',
        });
      }
      if (handleCors(req, res, allowed)) {
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
          json(res, 502, {
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
