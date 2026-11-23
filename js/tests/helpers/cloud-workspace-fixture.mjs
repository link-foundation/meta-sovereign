import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import http2 from 'node:http2';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../src/server/index.js';
import { makeLocalCertificate } from '../../src/server/local-tls.js';

export const WORKSPACE_BRAND = 'Northwind Workspace';
const logo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAcklEQVR4nGNgQAJsBa3/qYEZ0AG1DMZpEU0toJXhcEsGzIJf//+DMSEDCKkbeAsIWUIVC/AZQDULcBlClTjAZwnVIhmXJVRNRdgsoXoyRbeEJvmA2ARAtgWkJGOKcjLNLaBZHFDFAmph2lsw9OtkWjdbAKgq6kV6Ss9GAAAAAElFTkSuQmCC',
  'base64'
);

export const startWorkspaceFixture = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cloud-browser-'));
  let handle;
  // Match the deployed ingress, which multiplexes live events and requests.
  const proxy = http2.createSecureServer(makeLocalCertificate(), (req, res) => {
    const {
      ':authority': host,
      ':method': _method,
      ':path': _path,
      ':scheme': _scheme,
      ...headers
    } = req.headers;
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: handle.port,
        path: req.url,
        method: req.method,
        headers: { ...headers, host },
      },
      (answer) => {
        const {
          connection: _connection,
          'keep-alive': _keepAlive,
          'transfer-encoding': _transferEncoding,
          ...headers
        } = answer.headers;
        res.writeHead(answer.statusCode, headers);
        answer.pipe(res);
        res.on('close', () => answer.destroy());
      }
    );
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  const sessions = new Set();
  proxy.on('session', (session) => {
    sessions.add(session);
    session.on('close', () => sessions.delete(session));
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const host = `127.0.0.1:${proxy.address().port}`;
  const origin = `https://${host}`;
  const ownerKey = randomBytes(32).toString('hex');
  const storeKey = randomBytes(32).toString('hex');
  try {
    handle = await startServer({
      port: 0,
      tls: false,
      cloud: {
        origin,
        host,
        ownerKey,
        storeKey,
        brand: { name: WORKSPACE_BRAND, accent: '#067085', logo },
      },
      storeDir: dir,
      secretPassphrase: storeKey,
      telegramAccount: false,
      emailPoll: false,
      enableHandlers: false,
      backups: { enabled: false },
      automations: { scheduler: false },
      log: null,
    });
  } catch (error) {
    proxy.close();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    origin,
    ownerKey,
    async close() {
      proxy.close();
      for (const session of sessions) {
        session.destroy();
      }
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
};
